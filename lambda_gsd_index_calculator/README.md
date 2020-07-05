
# Basics
## Deploy serverless function
```bash
sls deploy --aws-profile duc
```

## Deploy only function without whole setup
```bash
sls deploy function -f calculate --aws-profile duc
```

## Invoke function
```bash
serverless invoke --function calculate --log --aws-profile duc
```

## Logging functions
```bash
sls logs -f calculate -t --aws-profile duc

sls logs -f preprocess1k -t --aws-profile duc
sls logs -f calculate1k -t --aws-profile duc
sls logs -f start-job -t --aws-profile duc
```

## start single sbdp job with serverless
```bash
serverless invoke --function start-job --log --aws-profile duc
```


# How to use
## Generate test data and store in S3

Generate test data with the script in `../test_data_generator/scripts/1-generate-task-data.js`

Check out the command in `../test_data_generator/README.md` to create data files on your machine.

Store generated files in a S3 bucket within a folder with the name `test-task-update-data-v1`.
Create the result folder with the name `gsd` in the same S3 bucket.

## Serverless big data app deployment

Deploy this serverless application with
```bash
sls deploy --aws-profile [YOUR_PROFILE]
```

## Start big data processing pipeline

Trigger serverless big data processing job with `POST` request to `start-job` enpoint (enpoint is given after previous deployment command)

Example:
```bash
curl -X POST https://dzsq601tu2.execute-api.eu-central-1.amazonaws.com/dev/start-job -H "Content-Type: application/json" -d '{"jobId":"value1"}'
```

After the job you should see the result of the processing in the `gsd` folder in the `test-task-update-data-v1` Bucket.

## Cleanup intermediate storage of big data pipeline and result folder

There is a helper function to clean up the S3 folder which are used for the pipeline

```bash
sls invoke -f cleanup --aws-profile [YOUR_PROFILE]
```
