import { meanBy, minBy, maxBy } from 'lodash'
import traceFetchingDelayRedisData from './traceFetchingDelaysRedis.json'

import traceFetchingDelaysRedisLocalData from './traceFetchingDelaysRedisLocal'

import traceFetchingDelaysXRayLocal from './traceFetchingDelaysXRay'

const main = () => {
  // console.log('+++traceFetchingDelayRedisData', traceFetchingDelayRedisData)
  const result = {
    max: maxBy(traceFetchingDelayRedisData, 'passedTime').passedTime,
    min: minBy(traceFetchingDelayRedisData, 'passedTime').passedTime,
    mean: meanBy(traceFetchingDelayRedisData, 'passedTime'),
    dataSetLength: traceFetchingDelayRedisData.length,
  }

  // console.log('+++traceFetchingDelaysRedisLocalData', traceFetchingDelaysRedisLocalData)
  const resultLocal = {
    max: maxBy(traceFetchingDelaysRedisLocalData, 'passedTime').passedTime,
    min: minBy(traceFetchingDelaysRedisLocalData, 'passedTime').passedTime,
    mean: meanBy(traceFetchingDelaysRedisLocalData, 'passedTime'),
    dataSetLength: traceFetchingDelaysRedisLocalData.length,
  }

  const resultXRayLocal = {
    max: maxBy(traceFetchingDelaysXRayLocal, 'passedTime').passedTime,
    min: minBy(traceFetchingDelaysXRayLocal, 'passedTime').passedTime,
    mean: meanBy(traceFetchingDelaysXRayLocal, 'passedTime'),
    dataSetLength: traceFetchingDelaysXRayLocal.length,
  }

  console.log(resultXRayLocal, 'xray api calls')
  console.log(resultLocal, 'local trace backend and redis on ec2:')
  console.log(result, 'trace backend and redis on same ec2:')
}

main()
