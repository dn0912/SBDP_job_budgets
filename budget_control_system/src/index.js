import express from 'express'
import bodyParser from 'body-parser'
import superagent from 'superagent'
import HttpStatus from 'http-status-codes'
import DynamoDB from './service/trace-store/dynamo'

const port = process.env.PORT || 3000
const traceStore = new DynamoDB()
const app = express()
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.text({
  type: ['json', 'text']
}))

app.get('/', (req, res) => res.status(200).json({
  hello: 'world!',
}))

app.post('/start-tracing', async (req, res) => {
  // const { jobUrl } = req.body
  const jobUrl = 'https://www.google.com'
  // const jobUrl = 'https://dzsq601tu2.execute-api.eu-central-1.amazonaws.com/dev/start-single-job'

  const response = await superagent
    .get(jobUrl)

  // console.log('+++', response)
  console.log('+++data', req.body)

  res.status(HttpStatus.OK).json({
    hello: 'there',
  })
})

app.post('/stop', () => {

})

app.post('/test-put-db', async (req, res) => {
  console.log('+++data', req.body)
  const createdItem = await traceStore.put('test')
  console.log('+++createdItem', createdItem)
  res.status(HttpStatus.CREATED).json({
    hello: 'world'
  })
})

app.get('/test-get-db', async (req, res) => {
  const createdItem = await traceStore.get()
  console.log('+++createdItem', createdItem)
  res.status(HttpStatus.OK).json({
    hello: 'world'
  })
})

app.listen(
  port,
  () => console.log(`App listening at http://localhost:${port}`),
)

export default app
