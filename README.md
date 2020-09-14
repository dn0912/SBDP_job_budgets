# SBDP_job_budgets

## How to setup and run this project

Follow those steps to setup necessary AWS resources and this project with the provided scripts. You need an AWS account with your **aws_access_key_id**, **aws_secret_access_key** and a **private key** to SSH into your EC2 instance.

To use the scripts you need the [AWS CLI](https://aws.amazon.com/cli/) installed on your machine.

### 1. Setup AWS resources (Security group, EC2, S3 bucket with generated test data, SNS topic, DynamoDb tables)
```bash
# chmod script to be executable
chmod 755 ./aws-resource-setup.sh

# execute script and follow instructions of that script
./aws-resource-setup.sh
```

### 2. Setup EC2 with Redis and this project

#### 2.1 SSH into your created EC2
```bash
ssh -i "<your key name>.pem" ubuntu@xxxxxxxxxx.[AWS_REGION].compute.amazonaws.com
```

#### 2.2 Create a file on your ec2 instance
```bash
vim ec2-instance-setup.sh
```

#### 2.3 Copy content from `./ec2-instance-setup.sh` to file on your EC2 instance and save

#### 2.4 Change file modes to be able to run script
```bash
chmod 755 ./ec2-instance-setup.sh
```

#### 2.5 Execute script and follow script instructions
```bash
./ec2-instance-setup.sh
```


After all installation, Redis server should be running on Port `6379` and job budget application on Port `3000`

### 3. Test whether you get response of running server and Redis by curl endpoint

```bash
# Test Node app
curl <ec-2-instance>.compute.amazonaws.com:3000/ping

# Test Redis
curl -X POST <ec-2-instance>.compute.amazonaws.com:3000/redis-test

# On your ec2 instance you can check in Redis for existence
redis-cli -a <your Redis password>
keys * # should print out "hello" key
get hello # should print out "world"
```

### 4. Edit serverless.yml of Serverless Big Data Processing application with Redis env vars

In `./lambda_gsd_index_calculator/serverless.yml`

Edit `REDIS_HOST: xx.xxx.xx.xxx` and `REDIS_CONNECTION: 'redis://:redis-password@xx.xxx.xx.xxx:6379'` with your `EC2 Public IPv4 address`

### 5. Deploy Serverless Big Data Processing application and start tracing job

To deploy the serverless data processing application install the [*Serverless framework*](https://www.serverless.com/framework/docs/getting-started/) first and then:

```bash
cd ./lambda_gsd_index_calculator/

npm i

sls deploy --aws-profile [PROFILE] # get `start-job` function endpoint (https://xxxxxx.amazonaws.com/dev/start-job)
```


Visit `http://<EC2 Public address>:<PORT>/live-job-status` (Default port *3000*) to see continuous cost tracing (or trough output console logs of EC2 instance)

Start serverless data processing through tracing app:

```bash
# Replace <> with your endoints
curl -X POST http://<your EC2 public endpoint>:3000/start-tracing -H "Content-Type: application/json" -d '{"jobUrl": "https://<your deployed data processing app start-job endpoint>", "budgetLimit": 0.0248}'

# e.g:
curl -X POST ec2-18-192-00-00.eu-central-1.compute.amazonaws.com:3000/start-tracing -H "Content-Type: application/json" -d '{"jobUrl": "https://17d8y00000.execute-api.eu-central-1.amazonaws.com/dev/start-job", "budgetLimit": 0.0248}'
```




## Additional info:
A [step-by-step instruction](./step-by-step-instruction.md) to setup all AWS resources and more informations can be found [here](./step-by-step-instruction.md).

### Troubleshoot: Find your AWS access key, AWS secret, AWS Default region and Redis password on your EC2 instance

``` 
cat ~/.aws/credentials

cat ~/SBDP_job_budgets/budget_control_system/.env

cat ~/redis-stable/redis.conf | grep "requirepass "
```
