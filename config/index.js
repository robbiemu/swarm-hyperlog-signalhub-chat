import uuid_gen from 'uuidv4'

const uuid = uuid_gen()

export default {
  signalhub: {
    channel: 'p2p-chat',
    hubs: ['http://localhost:8099']
  },
  hyperlog: {
    config: {
      valueEncoding: 'json'
    }
  },
  swarm: {
    opts: { uuid }
  }
}
