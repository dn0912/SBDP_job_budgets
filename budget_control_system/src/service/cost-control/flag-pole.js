import Redis from 'ioredis'

import { REDIS_PORT, REDIS_HOST, REDIS_PASSWORD } from '../../index'

export default class FlagPoleService extends Redis {
  constructor(jobId, budgetLimit) {
    super({
      port: REDIS_PORT, // Redis port
      host: REDIS_HOST, // Redis host
      family: 4, // 4 (IPv4) or 6 (IPv6)
      password: REDIS_PASSWORD,
      db: 0,
    })
    this.budgetLimit = budgetLimit
    this.jobId = jobId
  }

  async isInBudgetLimit(currentCost) {
    if (currentCost > this.budgetLimit) {
      console.log('+++currentCost', currentCost)
      console.log('+++isInBudgetLimit', await this.get(this.jobId))
      this.set(this.jobId, 'STOP')

      return false
    }
    return true
  }
}
