# SBDP_job_budgets

## Setup EC2 instance with Redis

### Create ec2 instance per AWS CLI
Note:
- `sg-0cd4e8a87c427827e` is a Security Group with Inbound rules for SSH communication and for Redis: TCP with port 6379 open to the public 0.0.0.0/0
- `ec2_test_22_07_2020` is a generated key name for SSH connection

```bash
aws ec2 run-instances \
  --image-id ami-04932daa2567651e7 \
  --count 1 \
  --instance-type t2.micro \
  --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=30}' \
  --security-group-ids sg-0cd4e8a87c427827e \
  --key-name ec2_test_22_07_2020 \
  --profile duc \
  --region eu-central-1
```

### Connect to instance for example with ssh
```bash
ssh -i "ec2_test_22_07_2020.pem" root@xxxxxxxxxx.eu-central-1.compute.amazonaws.com
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
```bash
redis-server /home/ubuntu/redis-stable/redis.conf &

cd ~/SBDP_job_budgets/budget_control_system

# Runs on default port is 3000 or set per env var PORT=XXXX
npm run start
```

### Find your AWS access key, AWS secret, AWS Default region and Redis password

```
cat ~/.aws/credentials

cat ~/SBDP_job_budgets/budget_control_system/.env

cat ~/redis-stable/redis.conf | grep "requirepass "
```

## Generate test data and upload to S3 for data processing application

### Generate test data

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


```bash
# Create S3 bucket with AWS CLI. LocationConstraint specifies where the bucket will be created (default US East (N. Virginia) Region (us-east-1))
aws s3api create-bucket \
  --bucket test-task-update-data-v2 \
  --create-bucket-configuration LocationConstraint=eu-central-1 \
  --profile duc \
  --region eu-central-1

# Create subresult folder with AWS CLI
aws s3api put-object \
  --bucket test-task-update-data-v2 \
  --key test_results/ \
  --profile duc \
  --region eu-central-1

# Create result folder with AWS CLI
aws s3api put-object \
  --bucket test-task-update-data-v2 \
  --key gsd/ \
  --profile duc \
  --region eu-central-1
```

### Generate test data

Generate test data with `./test_data_generator/scripts/1-generate-task-data.js`
```bash
```


## Serverless CLI commands

```bash
# deploy lambda with the serverless.yaml on a specific aws-profile saved in ~/.aws/credentials 
# using serverless credential ref https://www.serverless.com/framework/docs/providers/aws/guide/credentials/
serverless deploy --aws-profile [PROFILE]

# invoke the Lambda directly and see resulting log via
serverless invoke --function [FUNCTION NAME] --log --aws-profile [PROFILE]
# curl https://XXXXXXX.execute-api.[YOUR_REGION].amazonaws.com/[ENDPOINT]

# logs with tailing flag
sls logs -f [FUNCTION NAME] -t --aws-profile [PROFILE]

# remove services in current working directory
sls remove --aws-profile [PROFILE]
```
