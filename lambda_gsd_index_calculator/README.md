
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
