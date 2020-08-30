# SBDP_job_budgets

## serverless cli commands

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


# Setup

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
