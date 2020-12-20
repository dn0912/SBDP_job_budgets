## Generate data into file

Command to generate test data of 10 tasks and safe in file named `test2.json`
```bash
./node_modules/.bin/babel-node scripts/1-generate-task-data.js -n 10 | json_pp > test2.json
```
