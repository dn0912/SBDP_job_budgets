import { meanBy, minBy, maxBy } from 'lodash'
// import csvtojson from 'csvtojson'

import traceFetchingDelayRedisData from './traceFetchingDelaysRedis.json'
import traceFetchingDelaysRedisLocalData from './traceFetchingDelaysRedisLocal.json'
import traceFetchingDelaysXRayLocal from './traceFetchingDelaysXRay.json'

const getTraceBackendAndRedisSameEC2CallsDelayStats = () => ({
  max: maxBy(traceFetchingDelayRedisData, 'passedTime').passedTime,
  min: minBy(traceFetchingDelayRedisData, 'passedTime').passedTime,
  mean: meanBy(traceFetchingDelayRedisData, 'passedTime'),
  dataSetLength: traceFetchingDelayRedisData.length,
})

const getXRayAPICallsDelayStats = () => ({
  max: maxBy(traceFetchingDelaysXRayLocal, 'passedTime').passedTime,
  min: minBy(traceFetchingDelaysXRayLocal, 'passedTime').passedTime,
  mean: meanBy(traceFetchingDelaysXRayLocal, 'passedTime'),
  dataSetLength: traceFetchingDelaysXRayLocal.length,
})

const getLocalTraceBackendAndRedis = () => ({
  max: maxBy(traceFetchingDelaysRedisLocalData, 'passedTime').passedTime,
  min: minBy(traceFetchingDelaysRedisLocalData, 'passedTime').passedTime,
  mean: meanBy(traceFetchingDelaysRedisLocalData, 'passedTime'),
  dataSetLength: traceFetchingDelaysRedisLocalData.length,
})

// const transformCSVToJson = async () => {
//   const cloudwatchCsvPath = './evaluation/lambdaProcessingTimeAccuracy_cw.csv'
//   const cw_result = await csvtojson().fromFile(cloudwatchCsvPath)
//   const cloudWatchObj = cw_result.reduce((acc, val) => ({
//     ...acc,
//     [val.RequestID]: val,
//   }), {})

//   const tracerCsvPath = './evaluation/lambdaProcessingTimeAccuracy_cw.csv'
//   const tracer_result = await csvtojson().fromFile(tracerCsvPath)
//   const tracerObj = tracer_result.reduce((acc, val) => ({
//     ...acc,
//     [val.RequestID]: {
//       ...val,
//       FunctionArn
//     },
//   }), {})

//   console.log('result', result)
// }

const main = async () => {
  console.log(getXRayAPICallsDelayStats(), 'xray api calls')
  console.log(getLocalTraceBackendAndRedis(), 'local trace backend and redis on ec2:')
  console.log(getTraceBackendAndRedisSameEC2CallsDelayStats(), 'trace backend and redis on same ec2:')

  // await transformCSVToJson()
}

main()
