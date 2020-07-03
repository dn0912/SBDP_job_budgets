import AWS from 'aws-sdk'

const credentials = new AWS.SharedIniFileCredentials({ profile: process.env.AWS_PROFILE })
AWS.config.credentials = credentials
AWS.config.update({
  region: process.env.AWS_RESOURCE_REGION,
})

const XRay = new AWS.XRay()

export default class CostTracer {
  constructor() {
    this.xray = XRay
  }

  // startTracing() {}

  async getXRayTraces(traceIds) {
    console.log('+++xray', this.xray)
    const param = {
      TraceIds: traceIds,
    }
    const traceData = await this.xray.batchGetTraces(param).promise()

    return traceData
  }
}
