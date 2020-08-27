import Redis from 'ioredis'

export default class FlagPoleService extends Redis {
  constructor(redisUrl, jobId, budgetLimit) {
    super(redisUrl)
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
