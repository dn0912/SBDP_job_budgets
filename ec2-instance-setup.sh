#!/bin/bash
echo "Please provide the necessary data"
echo "#################################"
read -p "AWS access key id:" INPUT_AWS_KEY
read -sp "AWS secret access key:" INPUT_AWS_SECRET
echo ""
read -p "AWS resource region:" INPUT_AWS_RESOURCE_REGION
read -sp "Redis instance password: " INPUT_REDIS_PASSWORD

# variable decleration
AWS_KEY=$INPUT_AWS_KEY
AWS_SECRET=$INPUT_AWS_SECRET
AWS_RESOURCE_REGION=$INPUT_AWS_RESOURCE_REGION
REDIS_PASSWORD=$INPUT_REDIS_PASSWORD

REDIS_CONFIG_FILE_PATH=/home/ubuntu/redis-stable/redis.conf

sudo apt-get update

# Install node
curl -sL https://deb.nodesource.com/setup_12.x | sudo -E bash -
sudo apt install nodejs


# Install git
sudo apt-get install git

# Install aws
cd ~
sudo apt-get install -y unzip
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

mkdir ~/.aws
touch ~/.aws/credentials
echo "[default]" >> ~/.aws/credentials
echo "aws_access_key_id=$AWS_KEY" >> ~/.aws/credentials
echo "aws_secret_access_key=$AWS_SECRET" >> ~/.aws/credentials

# Install docker
# sudo apt install docker.io
# sudo systemctl start docker
# sudo systemctl enable docker
# docker --version
# sudo groupadd docker
# sudo gpasswd -a $USER docker
# docker pull redis
# docker run -d -p 6379:6379 redis --protected-mode no
# docker ps

# Install redis and setup
cd ~
sudo apt install make gcc libc6-dev tcl
wget http://download.redis.io/redis-stable.tar.gz
tar xvzf redis-stable.tar.gz
cd ./redis-stable
sudo make install
sed -i 's/protected-mode yes/protected-mode no/' $REDIS_CONFIG_FILE_PATH
sed -i 's/bind\s127.0.0.1/bind 0.0.0.0/' $REDIS_CONFIG_FILE_PATH
sed -i "s/# requirepass.*/requirepass $REDIS_PASSWORD/" $REDIS_CONFIG_FILE_PATH
# redis-cli -a <password>

# Clone project and run
cd ~
git clone https://github.com/dn0912/SBDP_job_budgets.git
cd ./SBDP_job_budgets/budget_control_system
npm i

echo "AWS_RESOURCE_REGION=$AWS_RESOURCE_REGION" >> ~/SBDP_job_budgets/budget_control_system/.env

# set SNS topic arn in .env file
AWS_ACCOUNT_ID="$(AWS_ACCESS_KEY_ID="$AWS_KEY" AWS_SECRET_ACCESS_KEY="$AWS_SECRET" aws sns list-topics --output text --region "$AWS_RESOURCE_REGION" | grep job-budget-alarm | cut -d ':' -f 5)"
echo "SNS_TOPIC_ARN=arn:aws:sns:$AWS_RESOURCE_REGION:$AWS_ACCOUNT_ID:job-budget-alarm" >> ~/SBDP_job_budgets/budget_control_system/.env

# start services
redis-server $REDIS_CONFIG_FILE_PATH &
REDIS_PASSWORD=$REDIS_PASSWORD npm run start
