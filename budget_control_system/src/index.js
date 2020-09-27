import express from 'express'
import bodyParser from 'body-parser'
import http from 'http'
import socketio from 'socket.io'
import multer from 'multer'
import events from 'events'

import JobTraceStore from './service/job-trace-store/dynamo'
import PriceList from './service/cost-control/price-list'
import XRayTracer from './service/tracer/xray-tracer'

import controller, { getJobStatus, startJobAndTrace } from './controller'
import initiateTestRoutes from './test-routes'

// import { _getRoomsByUser } from './utils'

const port = process.env.PORT || 3000

export const {
  REDIS_URL = 'redis://localhost:6379',
  REDIS_HOST = '127.0.0.1',
  REDIS_PORT = 6379,
  REDIS_PASSWORD,
  REDIS_CONNECTION,
} = process.env

console.log('REDIS VARS:', {
  REDIS_URL,
  REDIS_HOST,
  REDIS_PORT,
  REDIS_PASSWORD,
  REDIS_CONNECTION,
})

const jobTraceStore = new JobTraceStore()
const priceList = new PriceList()
const xRayTracer = new XRayTracer()
const eventEmitter = new events.EventEmitter()

const upload = multer({ dest: 'uploads/' })
const app = express()
const httpServer = http.createServer(app)
const io = socketio(httpServer)

io.on('connect', (socket) => {
  console.log('socket io connection')

  socket.on('disconnect', () => {
    console.log('disconnected')
  })

  socket.on('get-job-trace-data', async (jobId) => {
    console.log('Socket event: get-job-trace-data', { jobId })

    const jobRecord = await jobTraceStore.get(jobId)

    if (jobRecord) {
      await getJobStatus({
        eventBus: eventEmitter,
        jobId,
      })
      // io.emit('return-job-trace-data', jobCostsDetails)
    } else {
      io.emit('no-job-found', jobId)
    }
  })

  socket.on('start-job-and-trace', async (data) => {
    console.log('Socket event: start-job-and-trace', { data })
    await startJobAndTrace(eventEmitter, data)
  })

  socket.on('subscribe', (jobId) => {
    console.log(`+++join room of jobId: ${jobId}`)
    socket.join(jobId)
    // console.log(`${socket.id} now in rooms `, _getRoomsByUser(io, socket.id))
  })

  socket.on('unsubscribe', (jobId) => {
    console.log(`+++leave room of jobId: ${jobId}`)
    socket.leave(jobId)
  })

  socket.on('test-event', (arg) => {
    console.log(arg)
    io.in('63b51cca-fe39-4b9e-be23-3d9b49bb916c').clients((err, clients) => {
      console.log('+++clients', clients)
    })
  })
})

eventEmitter.addListener('job-costs-calculated', (jobId, jobCostResult) => {
  // console.log('+++eventEmitter.addListener', jobId, jobCost)
  io.emit('stream-job-costs', { ...jobCostResult, jobId })
})

// for parsing application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }))

// for parsing application/json
app.use(bodyParser.text({
  type: ['json', 'text']
}))

// for parsing multipart/form-data
app.use(express.static(__dirname + '/public'))

app.get('/ping', (req, res) => res.status(200).json({
  pong: 'Hello world!',
}))

/* Example curls:
curl -X POST http://localhost:8080/start-tracing
curl -X POST http://localhost:8080/start-tracing -H "Content-Type: application/json" -d '{"jobUrl": "hello:world"}'
curl -X POST http://localhost:8080/start-tracing -H "Content-Type: application/json" -d '{"jobUrl": "hello:world", "appId": "helloWorld", "budgetLimit": "0.0248"}'
*/
/**
 * start serverless big data processing tracing endpoint
 *
 * @param {string} jobUrl - start endpoint of the serverless big data processing job
 * @param {string} appId - to read app configuration from store for pricing calculation
 * @param {string} budgetLimit - max budget of big data processing app
 * @param {number} periodInSec - how long the system should should poll for trace and calculate the job price - in seconds
 *
 * @returns {object}
*/
app.post('/start-tracing', controller.startTracingRouteHandler(eventEmitter))

/**
 * stop serverless big data processing tracing endpoint
*/
app.post('/stop', () => {})

// example curl: curl -i -X POST -H "Content-Type: multipart/form-data" -F "data=@./lambda_gsd_index_calculator/.serverless/cloudformation-template-update-stack.json" -F "userid=1234" http://localhost:8080/register-app
app.post('/register-app', upload.single('data'), controller.registerApp)

// curl -X POST http://localhost:8080/subscribe-budget-alarm -H "Content-Type: application/json" -d '{"mail": "abc@def.com"}'
app.post('/subscribe-budget-alarm', controller.subscribeToBudgetAlarm)

app.get('/get-app-info/:appId', controller.getRegisteredApp)

app.get('/get-job-info/:jobId', controller.getJobRecord)

app.get('/job-status/:jobId', controller.getJobStatusRouteHandler(eventEmitter))

app.get('/live-job-status', (req, res) => {
  console.log('+++req.query', req.query)
  res.sendFile(`${__dirname}/public/index.html`)
})

// TODO: will be removed, just test routes
initiateTestRoutes({
  app,
  jobTraceStore,
  priceList,
  tracer: xRayTracer,
})

httpServer.listen(
  port,
  () => console.log(`App listening at http://localhost:${port}`),
)

export default app
