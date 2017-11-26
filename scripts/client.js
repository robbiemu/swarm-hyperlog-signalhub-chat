/* based on https://www.reddit.com/r/javascript/comments/5kdy4m/best_webrtc_library/#siteTable_t1_dboe0a9 */

import level from 'level-browserify' // provides a fs-like abstraction
import hyperlog from 'hyperlog' // provides a ledger of transactions
import wswarm from 'webrtc-swarm' // provides a p2p network
import signalhub from 'signalhub' // provides service to connect to p2p network
import concat from 'concat-stream' // reduces a stream from a buffer

import moment from 'moment'
import P2Pgraph from 'p2p-graph' // visualization

import config from '../config'

const tag = '[p2p-client]'

let passport = { name: 'You', id: config.swarm.opts.uuid }

/* graph */
let graph = new P2Pgraph('.p2p-graph')

function resetGraph () {
  document.querySelector('.p2p-graph').innerHTML = ''
  
  graph = new P2Pgraph('.p2p-graph')
}

function updateGraph (swarmnode) {
  let node = {...swarmnode}
  if(node.id === passport.id) {
    node.me = true
  } else if (node.name === 'You') {
    node.name = 'Anonymous'
  }
//  console.log('updateGraph', node)

  let nodes = graph.list()
  let isChangedItemInGraph = nodes.some((n,i) =>
    n.id === node.id && n.name !== node.name)
  let isItemInGraph = nodes.some(n => n.id === node.id)

  if (isChangedItemInGraph || !isItemInGraph) {
    if (isChangedItemInGraph)
      try {
        graph.remove(node.id)
      } catch (e) { console.error(e) }

    graph.add(node)

    if (!node.me)
      graph.connect(passport.id, node.id)
  }
}

updateGraph(passport)    

/* swarm */
const db = level('db')
const log = hyperlog(db, config.hyperlog.config)

const swarmOpts = Object.assign({}, config.swarm.opts, {
  wrap: (outgoingSignalingData, destinationSignalhubChannel) => {
    return getOutgoing(outgoingSignalingData)
  },
  unwrap: (incomingData, sourceSignalhubChannel) => {
    updateGraph(incomingData.passport)

    return incomingData.payload
  }
})

const swarm = wswarm(signalhub(config.signalhub.channel, config.signalhub.hubs),
  swarmOpts)

function getOutgoing (outgoingSignalingData) {
  return {
    passport,
    payload: outgoingSignalingData
  }
}

// handle swarm tx
swarm.on('peer', (peer, id) => { // handle p2p transmission
  let replicate = log.replicate({
    live: true
  })
  peer.pipe(replicate).pipe(peer)

  console.log('connected to a new peer:', id)
  console.log('total peers:', swarm.peers.length)
})

swarm.on('disconnect', function (peer, id) {
  graph.remove(id)
  console.log('disconnected from a peer:', id)
  console.log('total peers:', swarm.peers.length)
})

/* hyperlog */

// handle ledger relay
log.on('add', function () {
  log.createReadStream().pipe(concat(body => { 
    console.log(tag + ' - add', body)

    let latest = body[body.length - 1]

    let message = []
    if (latest.value.passport.name)  {
      let name = latest.value.passport.name
      if (name === 'You' && latest.value.passport.id !== passport.id)
        name = 'Anonymous'
      if(name !== 'You' && latest.value.passport.id === passport.id)
        name += '(You)'

      message.push(name)
    } else if (latest.value.passport.id) {
      message.push(`[${latest.value.passport.id}]`)
    }
    message.push(`[${ moment().format('HH:mm') }]`)
    message.push(JSON.stringify(latest.value.message))

    addMessage(message)
  }))
})

/* ui */
function addMessage (message) {
  let ul = document.querySelector('.p2p-chat .log')
  
      let li = document.createElement('li')
      li.classList.add('entry')
      li.innerText = message.join(' ')
  
      ul.prepend(li)  
}

document.forms.chat.elements.submit_chat.onclick = function (e) {
  let message = document.forms.chat.elements.chat.value

  console.log(tag + ' - submit', message)

  log.append({passport, message}, (err, node) => {
    if (err) console.error(tag + '- log.add error', err, node)
  })
}

document.forms.login.elements.submit_name.onclick = function (e) {
  if(!document.forms.login.elements.name.value)
    return

  passport = {
    name: document.forms.login.elements.name.value,
    id: config.swarm.opts.uuid
  }

  resetGraph()
}
