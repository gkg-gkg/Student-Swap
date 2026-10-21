// StudentSwap backend, handoff steps 2 and 3 (+ minimal login). One stack, deployable with `npx cdk deploy`.
//
//   Browser ──► API Gateway (HTTP API) ──► authorizer Lambda (checks the Cognito ID token, outside the VPC)
//                     │
//                     └──► API Lambda (in the VPC) ──► RDS Postgres (IAM auth, no password stored)
//                                    │
//   Browser ── presigned PUT ──► S3 (private, KMS) ── ObjectCreated ──► SQS ──► ticket-scan Lambda (in the VPC)
//   Cognito ── pre-sign-up (uni email allowlist) / post-confirmation (users row)
//
// The VPC has no NAT gateway (saves about £30/month): Lambdas reach S3 through a free gateway endpoint, RDS directly,
// and sign their database tokens and S3 links locally. Later steps that call the internet (Stripe, Claude) will need
// either a NAT (gateway or a small NAT instance) or to run outside the VPC; see backend/README.md.
import { fileURLToPath } from 'node:url';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { HttpLambdaAuthorizer, HttpLambdaResponseType } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as guardduty from 'aws-cdk-lib/aws-guardduty';
import * as triggers from 'aws-cdk-lib/triggers';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const backend = fileURLToPath(new URL('../', import.meta.url));
const DB_NAME = 'studentswap';
const DB_APP_USER = 'app';

export class StudentSwapStack extends cdk.Stack {
  /**
   * @param {import('constructs').Construct} scope @param {string} id
   * @param {cdk.StackProps & { siteOrigin: string, requirePayouts: boolean, malwareScan: boolean }} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);
    const { siteOrigin, requirePayouts, malwareScan } = props;

    // ---------- Network + database ----------
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [{ name: 'isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 }],
    });
    vpc.addGatewayEndpoint('S3', { service: ec2.GatewayVpcEndpointAwsService.S3 });

    const db = new rds.DatabaseInstance(this, 'Db', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      credentials: rds.Credentials.fromGeneratedSecret('ssadmin'),
      databaseName: DB_NAME,
      iamAuthentication: true,
      storageEncrypted: true,
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      backupRetention: cdk.Duration.days(7), // point-in-time restore within the week (handoff §12)
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      publiclyAccessible: false,
      parameters: { 'rds.force_ssl': '1' },
    });

    // ---------- Private ticket storage ----------
    const filesKey = new kms.Key(this, 'FilesKey', {
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    const bucket = new s3.Bucket(this, 'Files', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: filesKey,
      bucketKeyEnabled: true,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins: [siteOrigin],
          allowedHeaders: ['content-type'],
          maxAge: 3000,
        },
      ],
      lifecycleRules: [{ abortIncompleteMultipartUploadAfter: cdk.Duration.days(1) }],
    });

    // ---------- Lambdas ----------
    const inVpc = { vpc, vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED } };
    const dbEnv = {
      DB_HOST: db.dbInstanceEndpointAddress,
      DB_PORT: db.dbInstanceEndpointPort,
      DB_NAME,
      DB_USER: DB_APP_USER,
      NODE_EXTRA_CA_CERTS: '/var/runtime/ca-cert.pem', // RDS certificates bundled with the Lambda runtime
    };
    /**
     * @param {string} name @param {string} entry relative to backend/
     * @param {Partial<nodejs.NodejsFunctionProps> & { nodeModules?: string[] }} [o]
     */
    const fn = (name, entry, { nodeModules, ...o } = {}) =>
      new nodejs.NodejsFunction(this, name, {
        entry: `${backend}${entry}`,
        projectRoot: repoRoot, // the backend imports pure modules from the frontend's src/lib and src/data
        depsLockFilePath: `${backend}package-lock.json`,
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 512,
        timeout: cdk.Duration.seconds(15),
        logGroup: new logs.LogGroup(this, `${name}Logs`, {
          retention: logs.RetentionDays.ONE_MONTH,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
        bundling: {
          format: nodejs.OutputFormat.ESM,
          target: 'node22',
          mainFields: ['module', 'main'],
          banner: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
          externalModules: [],
          nodeModules, // installed as real node_modules (WebAssembly packages that load their .wasm from disk)
        },
        ...o,
      });

    const apiFn = fn('Api', 'src/api.mjs', {
      ...inVpc,
      environment: { ...dbEnv, BUCKET: bucket.bucketName, REQUIRE_PAYOUTS: String(requirePayouts) },
    });
    const scanFn = fn('TicketScan', 'src/scan/handler.mjs', {
      ...inVpc,
      memorySize: 1536, // rendering a PDF page and decoding codes
      timeout: cdk.Duration.seconds(60),
      nodeModules: ['mupdf', 'zxing-wasm'],
      environment: { ...dbEnv, BUCKET: bucket.bucketName },
    });
    const postConfirmFn = fn('PostConfirmation', 'src/auth/post-confirmation.mjs', { ...inVpc, environment: dbEnv });
    const preSignUpFn = fn('PreSignUp', 'src/auth/pre-sign-up.mjs');

    for (const f of [apiFn, scanFn, postConfirmFn]) {
      db.connections.allowDefaultPortFrom(f);
      db.grantConnect(f, DB_APP_USER);
    }
    bucket.grantReadWrite(apiFn); // presigns PUTs (uploads) and GETs (admin preview, later buyer downloads)
    bucket.grantRead(scanFn);
    bucket.grantDelete(scanFn); // infected files are deleted

    // Migrations: run on every deploy whose migration code changed. Connects as the RDS master user, whose password
    // CloudFormation resolves from Secrets Manager into this one function's environment (no Secrets Manager endpoint
    // needed inside the VPC). It creates the IAM-only `app` user that everything else uses.
    const migrateFn = fn('Migrate', 'db/migrate.mjs', {
      ...inVpc,
      timeout: cdk.Duration.minutes(2),
      environment: {
        ...dbEnv,
        DB_MASTER_USER: /** @type {rds.DatabaseSecret} */ (db.secret).secretValueFromJson('username').unsafeUnwrap(),
        DB_MASTER_PASSWORD: /** @type {rds.DatabaseSecret} */ (db.secret)
          .secretValueFromJson('password')
          .unsafeUnwrap(),
      },
    });
    db.connections.allowDefaultPortFrom(migrateFn);
    new triggers.Trigger(this, 'RunMigrations', {
      handler: migrateFn,
      executeAfter: [db],
      executeOnHandlerChange: true,
    });

    // ---------- Ticket scan wiring ----------
    if (!malwareScan) {
      const dlq = new sqs.Queue(this, 'TicketScanDlq', { retentionPeriod: cdk.Duration.days(14), enforceSSL: true });
      const queue = new sqs.Queue(this, 'TicketScanQueue', {
        visibilityTimeout: cdk.Duration.minutes(6),
        deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
        enforceSSL: true,
      });
      bucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.SqsDestination(queue), { prefix: 'tickets/' });
      scanFn.addEventSource(new SqsEventSource(queue, { batchSize: 5, reportBatchItemFailures: true }));
    } else {
      // GuardDuty Malware Protection for S3 scans each new ticket, then EventBridge hands us its verdict.
      // NOT verified in a real account yet: check this role against AWS's "Malware Protection for S3" IAM docs first.
      const gdRole = new iam.Role(this, 'MalwareScanRole', {
        assumedBy: new iam.ServicePrincipal('malware-protection-plan.guardduty.amazonaws.com'),
      });
      gdRole.addToPolicy(
        new iam.PolicyStatement({
          actions: [
            'events:PutRule',
            'events:DeleteRule',
            'events:PutTargets',
            'events:RemoveTargets',
            'events:DescribeRule',
            'events:ListTargetsByRule',
          ],
          resources: [
            `arn:aws:events:${this.region}:${this.account}:rule/DO-NOT-DELETE-AmazonGuardDutyMalwareProtectionS3*`,
          ],
        }),
      );
      gdRole.addToPolicy(
        new iam.PolicyStatement({
          actions: ['s3:PutBucketNotification', 's3:GetBucketNotification', 's3:GetBucketLocation', 's3:ListBucket'],
          resources: [bucket.bucketArn],
        }),
      );
      gdRole.addToPolicy(
        new iam.PolicyStatement({
          actions: [
            's3:GetObject',
            's3:GetObjectVersion',
            's3:GetObjectTagging',
            's3:PutObjectTagging',
            's3:GetObjectVersionTagging',
            's3:PutObjectVersionTagging',
          ],
          resources: [bucket.arnForObjects('tickets/*')],
        }),
      );
      filesKey.grantDecrypt(gdRole);
      new guardduty.CfnMalwareProtectionPlan(this, 'MalwareScan', {
        role: gdRole.roleArn,
        protectedResource: { s3Bucket: { bucketName: bucket.bucketName, objectPrefixes: ['tickets/'] } },
        actions: { tagging: { status: 'ENABLED' } },
      });
      new events.Rule(this, 'MalwareScanResult', {
        eventPattern: {
          source: ['aws.guardduty'],
          detailType: ['GuardDuty Malware Protection Object Scan Result'],
          detail: { s3ObjectDetails: { bucketName: [bucket.bucketName] } },
        },
        targets: [new targets.LambdaFunction(scanFn, { retryAttempts: 3 })],
      });
    }

    // ---------- Login (minimal: handoff §3) ----------
    const users = new cognito.UserPool(this, 'Users', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      signInCaseSensitive: false,
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: false } },
      userVerification: { emailStyle: cognito.VerificationEmailStyle.CODE },
      // The site also asks for at least one letter; Cognito can only require lowercase/uppercase specifically.
      passwordPolicy: {
        minLength: 8,
        requireDigits: true,
        requireLowercase: false,
        requireUppercase: false,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      lambdaTriggers: { preSignUp: preSignUpFn, postConfirmation: postConfirmFn },
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    const webClient = users.addClient('Web', {
      authFlows: { userSrp: true },
      generateSecret: false,
      preventUserExistenceErrors: true,
    });
    new cognito.CfnUserPoolGroup(this, 'AdminGroup', {
      userPoolId: users.userPoolId,
      groupName: 'admin',
      description: 'StudentSwap moderators',
    });

    // ---------- API ----------
    const authorizerFn = fn('Authorizer', 'src/auth/authorizer.mjs', {
      timeout: cdk.Duration.seconds(5),
      environment: { USER_POOL_ID: users.userPoolId, USER_POOL_CLIENT_ID: webClient.userPoolClientId },
    });
    // Runs on every request but never blocks one: public routes must work signed out. Routes check access themselves.
    const authorizer = new HttpLambdaAuthorizer('Caller', authorizerFn, {
      responseTypes: [HttpLambdaResponseType.SIMPLE],
      identitySource: [],
      resultsCacheTtl: cdk.Duration.seconds(0),
    });
    const api = new apigw.HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowOrigins: [siteOrigin],
        allowMethods: [
          apigw.CorsHttpMethod.GET,
          apigw.CorsHttpMethod.POST,
          apigw.CorsHttpMethod.PUT,
          apigw.CorsHttpMethod.PATCH,
          apigw.CorsHttpMethod.DELETE,
        ],
        allowHeaders: ['authorization', 'content-type'],
        maxAge: cdk.Duration.hours(1),
      },
    });
    api.addRoutes({
      path: '/{proxy+}',
      methods: [
        apigw.HttpMethod.GET,
        apigw.HttpMethod.POST,
        apigw.HttpMethod.PUT,
        apigw.HttpMethod.PATCH,
        apigw.HttpMethod.DELETE,
      ],
      integration: new HttpLambdaIntegration('ApiIntegration', apiFn),
      authorizer,
    });
    // Basic rate limit for the whole API (handoff §12). Add WAF for per-IP limits before launch.
    const stage = /** @type {apigw.CfnStage} */ (api.defaultStage?.node.defaultChild);
    stage.addPropertyOverride('DefaultRouteSettings', { ThrottlingBurstLimit: 100, ThrottlingRateLimit: 50 });

    // ---------- What the frontend build needs (Amplify Hosting -> Environment variables) ----------
    new cdk.CfnOutput(this, 'ApiBaseUrl', { value: api.apiEndpoint, description: 'API_BASE_URL' });
    new cdk.CfnOutput(this, 'AwsRegion', { value: this.region, description: 'AWS_REGION' });
    new cdk.CfnOutput(this, 'UserPoolId', { value: users.userPoolId, description: 'COGNITO_USER_POOL_ID' });
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: webClient.userPoolClientId,
      description: 'COGNITO_CLIENT_ID',
    });
    new cdk.CfnOutput(this, 'FilesBucket', { value: bucket.bucketName });
  }
}
