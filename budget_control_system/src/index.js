import express from 'express'
import bodyParser from 'body-parser'
import superagent from 'superagent'
import HttpStatus from 'http-status-codes'
import DynamoDB from './service/trace-store/dynamo'
import PriceList from './service/cost-control/price-list'

const serialize = (object) => JSON.stringify(object, null, 2)

const port = process.env.PORT || 3000

const traceStore = new DynamoDB()
const priceList = new PriceList()

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

// **************
// TEST ROUTES!?!

// AWS DynamoDB
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

// AWS Price List Service API
app.get('/test-get-prices', async (req, res) => {
  const response = await priceList.describeServices()
  console.log('+++response', response)
  console.log('+++Service', response.Services.find((srvc) => srvc.ServiceCode === 'AWSLambda'))
  console.log('+++Service', response.Services.find((srvc) => srvc.ServiceCode === 'AmazonDynamoDB'))

  console.log('+++describeLambdaServices', (await priceList.describeLambdaServices()).Services[0])
  res.status(HttpStatus.OK).json({
    hello: 'world'
  })
})

app.get('/test-get-products', async (req, res) => {
  // const response = await priceList.getLambdaProducts()
  const response = await priceList.getS3Products()
  // console.log('+++response', serialize(response))
  console.log('+++describeS3Services', (await priceList.describeS3Services()).Services[0])
  res.status(HttpStatus.OK).json({
    hello: 'world'
  })
})

// TEST ROUTES!?!
// **************

app.listen(
  port,
  () => console.log(`App listening at http://localhost:${port}`),
)

export default app
