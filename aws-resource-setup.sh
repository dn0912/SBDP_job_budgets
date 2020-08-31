#!/bin/bash

CURRENT_WORKING_DIR=$(pwd)
echo $CURRENT_WORKING_DIR

echo "Please provide the necessary data"
echo "#################################"
read -p "AWS access key id:" INPUT_AWS_KEY
read -sp "AWS secret access key:" INPUT_AWS_SECRET
echo ""
read -p "AWS resource region [eu-central-1]:" INPUT_AWS_RESOURCE_REGION
INPUT_AWS_RESOURCE_REGION=${INPUT_AWS_RESOURCE_REGION:-eu-central-1}
echo $INPUT_AWS_RESOURCE_REGION
read -p "AWS key name for SSH:" INPUT_AWS_KEY_NAME



CURRENT_WORKING_DIR=$(pwd)

# Create security group
AWS_ACCESS_KEY_ID=$INPUT_AWS_KEY AWS_SECRET_ACCESS_KEY=$INPUT_AWS_SECRET aws ec2 create-security-group \
  --group-name job-budget-security-group \
  --description "Job budget application" \
  --region $INPUT_AWS_RESOURCE_REGION

# Save security group id in var
SECURITY_GROUP_ID="$(AWS_ACCESS_KEY_ID="$INPUT_AWS_KEY" AWS_SECRET_ACCESS_KEY="$INPUT_AWS_SECRET" aws ec2 describe-security-groups --group-names job-budget-security-group --query 'SecurityGroups[*].[GroupId]' --output text --region "$INPUT_AWS_RESOURCE_REGION")"

# Add rule to allow inbound traffic - SSH, Redis and Node app
AWS_ACCESS_KEY_ID=$INPUT_AWS_KEY AWS_SECRET_ACCESS_KEY=$INPUT_AWS_SECRET aws ec2 authorize-security-group-ingress \
    --group-id $SECURITY_GROUP_ID \
    --ip-permissions \
      IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges='[{CidrIp=0.0.0.0/0,Description="SSH"}]' \
      IpProtocol=tcp,FromPort=6379,ToPort=6379,IpRanges='[{CidrIp=0.0.0.0/0,Description="Redis"}]' \
      IpProtocol=tcp,FromPort=3000,ToPort=3000,IpRanges='[{CidrIp=0.0.0.0/0,Description="Node app"}]' \
    --region $INPUT_AWS_RESOURCE_REGION

echo "Sucessfully created security group..."

# Create ec2 instance with security group
AWS_ACCESS_KEY_ID=$INPUT_AWS_KEY AWS_SECRET_ACCESS_KEY=$INPUT_AWS_SECRET aws ec2 run-instances \
  --image-id ami-04932daa2567651e7 \
  --count 1 \
  --instance-type t2.micro \
  --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=30}' \
  --security-group-ids $SECURITY_GROUP_ID \
  --key-name $INPUT_AWS_KEY_NAME \
  --region $INPUT_AWS_RESOURCE_REGION

echo "Sucessfully created ec instance..."

####################
# Generate test data

cd "$CURRENT_WORKING_DIR/test_data_generator"
npm i
rm -r test_data/
mkdir test_data

echo "Start generating mock data..."

# Generate 4 data files with 500, 1000, 1500 and 2000 mocked tasks
./node_modules/.bin/babel-node scripts/1-generate-task-data.js -n 500 | json_pp > ./test_data/test_with_description_title_change_500_single.json

./node_modules/.bin/babel-node scripts/1-generate-task-data.js -n 1000 | json_pp > ./test_data/test_with_description_title_change_1000_single.json

./node_modules/.bin/babel-node scripts/1-generate-task-data.js -n 1500 | json_pp > ./test_data/test_with_description_title_change_1500_single.json

./node_modules/.bin/babel-node scripts/1-generate-task-data.js -n 2000 | json_pp > ./test_data/test_with_description_title_change_2000_single.json

echo "Sucessfully generated test data..."

# Create S3 bucket
AWS_ACCESS_KEY_ID=$INPUT_AWS_KEY AWS_SECRET_ACCESS_KEY=$INPUT_AWS_SECRET aws s3api create-bucket \
  --bucket test-task-update-data-v2 \
  --create-bucket-configuration LocationConstraint=$INPUT_AWS_RESOURCE_REGION \
  --region $INPUT_AWS_RESOURCE_REGION

# Create subresult folder in S3 bucket
AWS_ACCESS_KEY_ID=$INPUT_AWS_KEY AWS_SECRET_ACCESS_KEY=$INPUT_AWS_SECRET aws s3api put-object \
  --bucket test-task-update-data-v2 \
  --key test_results/ \
  --region $INPUT_AWS_RESOURCE_REGION

# Create result folder in S3 bucket
AWS_ACCESS_KEY_ID=$INPUT_AWS_KEY AWS_SECRET_ACCESS_KEY=$INPUT_AWS_SECRET aws s3api put-object \
  --bucket test-task-update-data-v2 \
  --key gsd/ \
  --region $INPUT_AWS_RESOURCE_REGION

# Upload generated test data to S3 bucket
AWS_ACCESS_KEY_ID=$INPUT_AWS_KEY AWS_SECRET_ACCESS_KEY=$INPUT_AWS_SECRET aws s3 cp "$CURRENT_WORKING_DIR/test_data_generator/test_data/" s3://test-task-update-data-v2/ \
  --recursive \
  --region $INPUT_AWS_RESOURCE_REGION

echo "Sucessfully uploaded test data to S3..."
