#!/bin/bash

echo "Please provide the necessary data"
echo "#################################"
read -p "AWS access key id:" INPUT_AWS_KEY
read -sp "AWS secret access key:" INPUT_AWS_SECRET
echo ""
read -p "AWS resource region:" INPUT_AWS_RESOURCE_REGION
read -p "AWS key name for SSH:" INPUT_AWS_KEY_NAME


# Security group
AWS_ACCESS_KEY_ID=$INPUT_AWS_KEY AWS_SECRET_ACCESS_KEY=$INPUT_AWS_SECRET aws ec2 create-security-group \
  --group-name job-budget-security-group \
  --description "Job budget application" \
  --region $INPUT_AWS_RESOURCE_REGION

# Save security group id in var
SECURITY_GROUP_ID="$(AWS_ACCESS_KEY_ID="$INPUT_AWS_KEY" AWS_SECRET_ACCESS_KEY="$INPUT_AWS_SECRET" aws ec2 describe-security-groups --group-names job-budget-security-group --query 'SecurityGroups[*].[GroupId]' --output text --region "$INPUT_AWS_RESOURCE_REGION")"

# Add rule to allow inbound SSH traffic 
# AWS_ACCESS_KEY_ID=$INPUT_AWS_KEY AWS_SECRET_ACCESS_KEY=$INPUT_AWS_SECRET aws ec2 authorize-security-group-ingress \
#   --group-id $SECURITY_GROUP_ID \
#   --protocol tcp \
#   --port 22 \
#   --cidr 0.0.0.0/0 \
#   --region $INPUT_AWS_RESOURCE_REGION

# Add rule to allow inbound traffic - SSH, Redis and Node app
AWS_ACCESS_KEY_ID=$INPUT_AWS_KEY AWS_SECRET_ACCESS_KEY=$INPUT_AWS_SECRET aws ec2 authorize-security-group-ingress \
    --group-id $SECURITY_GROUP_ID \
    --ip-permissions \
      IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges='[{CidrIp=0.0.0.0/0,Description="SSH"}]' \
      IpProtocol=tcp,FromPort=6379,ToPort=6379,IpRanges='[{CidrIp=0.0.0.0/0,Description="Redis"}]' \
      IpProtocol=tcp,FromPort=3000,ToPort=3000,IpRanges='[{CidrIp=0.0.0.0/0,Description="Node app"}]' \
    --region $INPUT_AWS_RESOURCE_REGION

AWS_ACCESS_KEY_ID=$INPUT_AWS_KEY AWS_SECRET_ACCESS_KEY=$INPUT_AWS_SECRET aws ec2 run-instances \
  --image-id ami-04932daa2567651e7 \
  --count 1 \
  --instance-type t2.micro \
  --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=30}' \
  --security-group-ids $SECURITY_GROUP_ID \
  --key-name $INPUT_AWS_KEY_NAME \
  --region $INPUT_AWS_RESOURCE_REGION
