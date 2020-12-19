# Step by step setup instruction

## Content
1. [Setup EC2 instance with Redis and job budget application](#setup-ec2-instance-with-redis-and-job-budget-application)
2. [Generate test data and upload to S3 for data processing application](#generate-test-data-and-upload-to-S3-for-data-processing-application)
3. [Deploy Serverless Big Data Processing application and start tracing job](#deploy-serverless-big-data-processing-application-and-start-tracing-job)


## Setup EC2 instance with Redis and job budget application

### Create DynamoDB tables
```bash
aws dynamodb create-table \
    --table-name app-register-store \
    --attribute-definitions \
        AttributeName=appId,AttributeType=S \
    --key-schema \
        AttributeName=appId,KeyType=HASH \
    --provisioned-throughput \
        ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --profile [PROFILE] \
    --region [AWS_REGION]

aws dynamodb create-table \
    --table-name job-trace-record \
    --attribute-definitions \
        AttributeName=jobId,AttributeType=S \
    --key-schema \
        AttributeName=jobId,KeyType=HASH \
    --provisioned-throughput \
        ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --profile [PROFILE] \
    --region [AWS_REGION]
```

### Create SNS topics for notification purpose
```bash
aws sns create-topic \
    --name job-budget-alarm \
    --profile [PROFILE] \
    --region [AWS_REGION]
```

### Create security group per AWS CLI
```bash
# Create security group
aws ec2 create-security-group \
  --group-name job-budget-sec-group \
  --description "Job budget application" \
  --profile [PROFILE] \
  --region [AWS_REGION]

# View security group details
aws ec2 describe-security-groups \
  --group-names job-budget-sec-group \
  --profile [PROFILE] \
  --region [AWS_REGION]

# Get security group id
aws ec2 describe-security-groups \
  --group-names job-budget-sec-group \
  --query 'SecurityGroups[*].[GroupId]' \
  --output text \
  --profile [PROFILE] \
  --region [AWS_REGION]

# Add rule to allow inbound SSH traffic
ec2 authorize-security-group-ingress \
    --group-id $SECURITY_GROUP_ID \
    --ip-permissions \
      IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges='[{CidrIp=0.0.0.0/0,Description="SSH"}]' \
      IpProtocol=tcp,FromPort=6379,ToPort=6379,IpRanges='[{CidrIp=0.0.0.0/0,Description="Redis"}]' \
      IpProtocol=tcp,FromPort=3000,ToPort=3000,IpRanges='[{CidrIp=0.0.0.0/0,Description="Node app"}]' \
    --profile [PROFILE] \
    --region $INPUT_AWS_RESOURCE_REGION
```

### Create ec2 instance per AWS CLI
Note:
- `sg-xxxxxxxxx` is a Security Group with Inbound rules for
  - SSH communication,
  - for Redis: TCP with port 6379 open to the public 0.0.0.0/0 and
  - TCP port 3000 open to the public 0.0.0.0/0 to access the NodeJS application.
- `ec2_test_22_07_2020` is a generated key name for SSH connection

```bash
aws ec2 run-instances \
  --image-id ami-04932daa2567651e7 \
  --count 1 \
  --instance-type t2.micro \
  --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=30}' \
  --security-group-ids sg-xxxxxxxxx \
  --key-name ec2_test_22_07_2020 \
  --profile [PROFILE] \
  --region [AWS_REGION]
```

### Connect to instance for example with ssh
```bash
ssh -i "<your key name>.pem" ubuntu@xxxxxxxxxx.[AWS_REGION].compute.amazonaws.com
```


### Copy shell script `ec2-isntance-setup.sh` to instance and run it:
```bash
vim ec2-isntance-setup.sh

# copy content from `ec2-isntance-setup.sh` to file and save

chmod 755 ec2-isntance-setup.sh

./ec2-isntance-setup.sh # AWS CLI and TCL (for Redis) needs to be confirmed with `Y` on installation
```

After all installation, Redis server should be running on Port `6379` and job budget application on Port `3000`

### Manually test whether all services are installed
```bash
npm --version
node --version
aws --version
redis-cli --version
redis-server --version
```

### Manually start Redis server and job budget application

You can use the `./start-app-script.sh` script to startup the Redis server and the NodeJS app with following command:

```bash
# to make script executable
chmod 755 start-app-script.sh

./start-app-script.sh
```

Start redis services and app individually:
```bash
redis-server /home/ubuntu/redis-stable/redis.conf &

cd ~/SBDP_job_budgets/budget_control_system-trace_backend

# Start job budget application with password protected redis connection
# Forgot Redis password? use: cat ~/redis-stable/redis.conf | grep "requirepass "
# Info: Runs on default port is 3000, you can also set per environment variable `PORT` e.g. PORT=XXXX REDIS_PASSWORD=<your redis password> npm run start
REDIS_PASSWORD=<your redis password> npm run start
```

### Test whether you can get response of running server by curl endpoint

```bash
curl <ec-2-instance>.compute.amazonaws.com:3000/ping
```

### Test whether you can store in Redis store of running server by curl endpoint

```bash
curl -X POST <ec-2-instance>.compute.amazonaws.com:3000/redis-test

# On your ec2 instance you can check in Redis for existence
redis-cli -a <your Redis password>
keys * # should print out "hello" key
get hello # should print out "world"
```

### Troubleshoot: Find your AWS access key, AWS secret, AWS Default region and Redis password

```
cat ~/.aws/credentials

cat ~/SBDP_job_budgets/budget_control_system-trace_backend/.env

cat ~/redis-stable/redis.conf | grep "requirepass "
```

## Generate test data and upload to S3 for data processing application

### Generate S3 bucket with folder structure
S3 Bucket should have this structure

```
[test-task-update-data-v1]                                    # S3 bucket
    ├── [test_results]                                        # S3 subresult folder
    ├── [gsd]                                                 # S3 result folder
    ├── test_with_description_title_change_500_single.json    # test data files
    ├── test_with_description_title_change_1000_single.json
    ├── test_with_description_title_change_1500_single.json
    └── test_with_description_title_change_2000_single.json
```

Run following commands:
```bash
# Create S3 bucket with AWS CLI. LocationConstraint specifies where the bucket will be created (default US East (N. Virginia) Region (us-east-1))
aws s3api create-bucket \
  --bucket test-task-update-data-v2 \
  --create-bucket-configuration LocationConstraint=[AWS_REGION] \
  --profile [PROFILE] \
  --region [AWS_REGION]

# Create subresult folder with AWS CLI
aws s3api put-object \
  --bucket test-task-update-data-v2 \
  --key test_results/ \
  --profile [PROFILE] \
  --region [AWS_REGION]

# Create result folder with AWS CLI
aws s3api put-object \
  --bucket test-task-update-data-v2 \
  --key gsd/ \
  --profile [PROFILE] \
  --region [AWS_REGION]
```

### Generate test data

Generate test data with `./test_data_generator/scripts/1-generate-task-data.js`

```bash
# in ./test_data_generator

npm i

mkdir test_data

# Generate 4 data files with 500, 1000, 1500 and 2000 mocked tasks
./node_modules/.bin/babel-node scripts/1-generate-task-data.js -n 500 | json_pp > ./test_data/test_with_description_title_change_500_single.json

./node_modules/.bin/babel-node scripts/1-generate-task-data.js -n 1000 | json_pp > ./test_data/test_with_description_title_change_1000_single.json

./node_modules/.bin/babel-node scripts/1-generate-task-data.js -n 1500 | json_pp > ./test_data/test_with_description_title_change_1500_single.json

./node_modules/.bin/babel-node scripts/1-generate-task-data.js -n 2000 | json_pp > ./test_data/test_with_description_title_change_2000_single.json
```

### Upload test data to S3 bucket

Upload all generated test files in the `./test_data_generator/test_data` folder
```bash
# currently in ./test_data_generator folder
aws s3 cp test_data s3://test-task-update-data-v2/ \
  --recursive \
  --profile [PROFILE] \
  --region [AWS_REGION]
```

## Deploy Serverless Big Data Processing application and start tracing job

### Deploy application with Serverless framework

To deploy the serverless data processing application install the [*Serverless framework*](https://www.serverless.com/framework/docs/getting-started/) first and then:
```bash
# change to `./lambda_gsd_index_calculator/`

npm i

sls deploy --aws-profile [PROFILE] # get start-job endpoint (https://xxxxxx.amazonaws.com/dev/start-job)
```


### Start serverless data processing through tracing app

```bash
curl -X POST http://<your EC2 public endpoint>:3000/start-tracing -H "Content-Type: application/json" -d '{"jobUrl": "https://<your deployed data processing app start-job endpoint>", "budgetLimit": 0.0248}'
```


### Usefull Serverless CLI commands

```bash
# deploy lambda with the serverless.yaml on a specific aws-profile saved in ~/.aws/credentials 
# using serverless credential ref https://www.serverless.com/framework/docs/providers/aws/guide/credentials/
serverless deploy --aws-profile [PROFILE]

# invoke the Lambda directly and see resulting log via
serverless invoke --function [FUNCTION NAME] --log --aws-profile [PROFILE]
# curl https://XXXXXXX.execute-api.[YOUR_REGION].amazonaws.com/[ENDPOINT]

# logs with tailing flag
sls logs -f [FUNCTION NAME] -t --aws-profile [PROFILE]

# get application info
sls info --aws-profile [PROFILE]

# remove services in current working directory
sls remove --aws-profile [PROFILE]
```
