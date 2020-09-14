import express from 'express'
import bodyParser from 'body-parser'
import http from 'http'
import socketio from 'socket.io'
import { get } from 'lodash'
import moment from 'moment'
import fs from 'fs'
import multer from 'multer'
import events from 'events'

import JobTraceStore from './service/job-trace-store/dynamo'
import PriceList from './service/cost-control/price-list'
import Tracer from './service/tracer'

import controller, { getJobStatus } from './controller'
import initiateTestRoutes from './test-routes'

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
const tracer = new Tracer()
const eventEmitter = new events.EventEmitter()

async function fetchTracePeriodically(dateNow, jobId) {
  // TODO: to measure trace fetching delay
  const pollPeriodinMs = 200
  const counter = {
    value: 0,
  }

  // delay it for 1 sec
  await new Promise((resolve) => setTimeout(() => {
    console.log('#### wait for 1 sec')
    resolve()
  }, 1000))
  while (counter.value < 30) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, pollPeriodinMs))
    const startTime = dateNow / 1000
    const endTime = Date.now() / 1000
    // eslint-disable-next-line no-await-in-loop
    const traceSummary = await tracer.getXRayTraceSummaries(startTime, endTime, jobId)

    const traceCloseTimeStampAnnotation = get(traceSummary, 'TraceSummaries[0].Annotations.currentTimeStamp[0].AnnotationValue.NumberValue', undefined)

    console.log('+++traceCloseTimeStampAnnotation', traceCloseTimeStampAnnotation)

    const currentTimeStamp = moment.utc().valueOf()
    console.log('+++currentTimeStamp', currentTimeStamp)

    const traceResult = {
      jobStartTimeStamp: dateNow,
      arn: get(traceSummary, 'TraceSummaries[0].ResourceARNs[0].ARN', undefined),
      traceCloseTimeStamp: traceCloseTimeStampAnnotation,
      currentTimeStamp,
      elapsedTimeFromClosingTraceToNow: currentTimeStamp - traceCloseTimeStampAnnotation,
    }

    console.log('+++traceSummary.TraceSummaries', traceSummary.TraceSummaries)

    // TODO: remove break statement => only for first fetch to record trace delay
    counter.value++
    if (traceSummary.TraceSummaries.length > 0) {
      console.log('+++traceSummaryArray', traceResult, { pollPeriodinMs })
      fs.appendFileSync(
        'traceFetchingDelays.csv',
        `\n${traceResult.jobStartTimeStamp}, ${traceResult.arn}, ${traceResult.traceCloseTimeStamp}, ${traceResult.currentTimeStamp}, ${traceResult.elapsedTimeFromClosingTraceToNow}`,
      )
      break
    }
  }
}
const upload = multer({ dest: 'uploads/' })
const app = express()
const httpServer = http.createServer(app)
const io = socketio(httpServer)

// function _getRoomsByUser(id) {
//   const usersRooms = []
//   const { rooms } = io.sockets.adapter

//   // eslint-disable-next-line
//   for (let room in rooms) {
//     if (rooms.hasOwnProperty(room)) {
//       const { sockets } = rooms[room]
//       if (id in sockets) {
//         usersRooms.push(room)
//       }
//     }
//   }

//   return usersRooms
// }

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

  socket.on('subscribe', (jobId) => {
    console.log(`+++join room of jobId: ${jobId}`)
    socket.join(jobId)
    // console.log(`${socket.id} now in rooms `, _getRoomsByUser(socket.id))
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

eventEmitter.addListener('job-costs-calculated', (jobId, jobCost) => {
  console.log('+++eventEmitter.addListener', jobId, jobCost)
  io.emit('stream-job-costs', { ...jobCost, jobId })
})

// for parsing application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }))

// for parsing application/json
app.use(bodyParser.text({
  type: ['json', 'text']
}))

// for parsing multipart/form-data
// app.use(express.static('public'))

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
 *
 * @returns {object}
*/
app.post('/start-tracing', controller.startTracing(eventEmitter))

/**
 * stop serverless big data processing tracing endpoint
*/
app.post('/stop', () => {

})

// example curl: curl -i -X POST -H "Content-Type: multipart/form-data" -F "data=@./lambda_gsd_index_calculator/.serverless/cloudformation-template-update-stack.json" -F "userid=1234" http://localhost:8080/register-app
app.post('/register-app', upload.single('data'), controller.registerApp)

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
  tracer,
})

httpServer.listen(
  port,
  () => console.log(`App listening at http://localhost:${port}`),
)

export default app
