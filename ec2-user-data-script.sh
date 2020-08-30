#!/bin/bash

# sudo apt-get update
apt-get update

# Install nvm and node
# cd ~
# curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
# . ~/.nvm/nvm.sh
# nvm install node
# node -e "console.log('Running Node.js ' + process.version)"
# sudo apt-get install npm
# apt-get install npm

# Install git
cd ~
# sudo apt-get install git
apt-get install git
# git --version

# Install aws
cd ~
# sudo apt-get install -y unzip
apt-get install -y unzip
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
# sudo ./aws/install -y
./aws/install -y
# aws --version
mkdir ~/.aws
touch ~/.aws/credentials
echo "[default]" >> ~/.aws/credentials
echo "aws_access_key_id=" >> ~/.aws/credentials
echo "aws_secret_access_key=" >> ~/.aws/credentials

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
# sudo apt install make gcc libc6-dev tcl
apt install make gcc libc6-dev tcl
wget http://download.redis.io/redis-stable.tar.gz
tar xvzf redis-stable.tar.gz
cd ./redis-stable
# sudo make install
make install
sed -i 's/protected-mode yes/protected-mode no/' /home/ubuntu/redis-stable/redis.conf
sed -i 's/bind\s127.0.0.1/bind 0.0.0.0/' /home/ubuntu/redis-stable/redis.conf
sed -i "s/# requirepass.*/requirepass this-is-my-password-0000/" /home/ubuntu/redis-stable/redis.conf
# redis-server path/to/redis.conf # start redis server with conf file
# redis-cli -a <password>

# Clone project and run
cd ~
git clone https://github.com/dn0912/SBDP_job_budgets.git
cd ./SBDP_job_budgets/budget_control_system/
npm i
# AWS_RESOURCE_REGION=eu-central-1 npm run start


# start services
redis-server /home/ubuntu/redis-stable/redis.conf &
AWS_RESOURCE_REGION=eu-central-1 npm run start
