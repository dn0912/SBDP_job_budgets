import { range } from 'lodash'
import moment from 'moment'
import fs from 'fs'
import uuid from 'node-uuid'

const randomStringGenerator = (prefix) => {
  // e.g. T123456
  const idChars = '1234567890'
  const randomString = range(6).reduce(
    acc => acc + idChars[Math.floor(Math.random() * 10)],
    `${prefix}`)

  return randomString
}

const generateRandomContextSet = (
  teamsAmount,
  channelsPerTeamAmount,
  usersPerTeamAmount,
) => {
  /*
   example: Permutation of channel with users
   Team1 with 2 channels and each channel 3 users
   Team4 with 5 channels and each channel 6 users
   Team7 with 8 channels and each channel 9 users
    [
      { teamId: T1, channelId: C1, userId: U1 },
      { teamId: T1, channelId: C2, userId: U1 },
      { teamId: T1, channelId: C1, userId: U2 },
      { teamId: T1, channelId: C2, userId: U2 },
      { teamId: T1, channelId: C1, userId: U3 },
      { teamId: T1, channelId: C2, userId: U3 },
    ]
  */

  const teamsArray = []
  const channelsArray = []
  const usersArray = []
  let uniqueEntitySet = new Set()

  const createUniqueId = (prefix) => {
    let randomId
    do {
      randomId = randomStringGenerator(prefix)
    } while (uniqueEntitySet.has(randomId))
    uniqueEntitySet.add(randomId)
    return randomId
  }

  for (let team = 0; team < teamsAmount; team++) {
    const randomTeamId = createUniqueId('Team-')
    teamsArray.push(randomTeamId)
  }

  for (let channel = 0; channel < channelsPerTeamAmount; channel++) {
    const randomChannelId = createUniqueId('Channel-')
    channelsArray.push(randomChannelId)
  }

  for (let user = 0; user < usersPerTeamAmount; user++) {
    const randomUserId = createUniqueId('User-')
    usersArray.push(randomUserId)
  }

  const context_set_array = []
  teamsArray.forEach(teamId => {
    channelsArray.forEach(channelId => {
      usersArray.forEach(userId => {
        context_set_array.push({
          teamId,
          channelId,
          userId,
        })
      })
    })
  })

  return context_set_array
}

const CONTEXT_SET = {
  teamId: 'T123',
  channelId: 'C123',
  userId: 'U123',
}


const STATUS_ARRAY = ['planned', 'progress', 'completed']

const taskTemplate = {
  _meta: {
    version: {
      updateDate: 1577837157853,
      statusId: 'status-id-123',
      stepId: 'step-id-123',
    },
  },
  priority: 1577724550781,
  title: "dummy test task title",
  description: "this is a description of a tast",
  labels: [],
  humanTaskId: null,
}

const createTask = (CONTEXT_SET) => {
  const { userId, teamId, channelId } = CONTEXT_SET
  const timeStamp = Date.now()

  return {
    ...taskTemplate,
    teamId,
    channelId,
    createDate: timeStamp,
    updateDate: timeStamp,
    createdBy: userId,
    updatedBy: userId,
    streamId: `${teamId}-${channelId}`,
    assignee: userId,
    statusId: STATUS_ARRAY[0],
    taskId: uuid.v4(),
  }
}

const updateTaskStatus = (task, status) => ({
  ...task,
  statusId: status,
  updateDate: task.updateDate + 50400000, // + 14 hours
})

const createEvent = (newTask, oldTask = {}) => ({
  Keys: {
    taskId: newTask.taskId,
  },
  NewImage: {
    ...newTask,
  },
  OldImage: {
    ...oldTask,
  },
  "SequenceNumber": "5698991600000000006845103024",
  "SizeBytes": 679,
  "ApproximateCreationDateTime": 1577837157,
  "eventName": "MODIFY" //TODO check creation eventname
})

const main = () => {
  const taskEvents = []
  // const randomContextSet = generateRandomContextSet(1, 1, 1)
  const randomContextSet = [CONTEXT_SET]
  const taskAmount = 1

  randomContextSet.forEach(contextSet => {
    for (let i = 0; i < taskAmount; i++) {
      const newTask = createTask(contextSet)
      const taskInProgress = updateTaskStatus(newTask, STATUS_ARRAY[1])
      const taskCompleted = updateTaskStatus(newTask, STATUS_ARRAY[2])

      taskEvents.push(
        createEvent(newTask),
        createEvent(taskInProgress, newTask),
        createEvent(taskCompleted, taskInProgress)
      )
    }
  })

  console.log(JSON.stringify(taskEvents))
}

main()
