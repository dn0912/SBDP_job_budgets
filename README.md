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
```
