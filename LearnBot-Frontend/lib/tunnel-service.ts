// Tunnel Service for managing SSH connections to remote LLM servers
import { spawn, ChildProcess } from 'child_process'
import fetch from 'node-fetch'

interface TunnelConfig {
  tunnelProcess: ChildProcess | null
  keepAliveInterval: NodeJS.Timeout | null
  lastPingTime: number
}

const tunnels: Record<string, TunnelConfig> = {
  'remote-a6000': {
    tunnelProcess: null,
    keepAliveInterval: null,
    lastPingTime: 0
  },
  'remote-blackwell': {
    tunnelProcess: null,
    keepAliveInterval: null,
    lastPingTime: 0
  }
}

// Keep track of tunnel status
let tunnelStatus: Record<string, boolean> = {
  'remote-a6000': false,
  'remote-blackwell': false
}

// Helper to create and start an SSH tunnel
async function createTunnel(modelId: 'remote-a6000' | 'remote-blackwell'): Promise<boolean> {
  const modelConfig = {
    'remote-a6000': {
      localPort: 5001,
      remotePort: 11434,
      tunnelCommand: "ssh -L 5001:localhost:11434 ra_aatmaj@129.10.156.97"
    },
    'remote-blackwell': {
      localPort: 8001,
      remotePort: 8000,
      tunnelCommand: "ssh -L 8001:localhost:8000 ra_aatmaj@129.10.156.97"
    }
  }[modelId]

  try {
    if (tunnels[modelId].tunnelProcess) {
      console.log(`[Tunnel Service] ${modelId} tunnel already exists`)
      return true
    }

    console.log(`[Tunnel Service] Starting ${modelId} tunnel...`)
    const [command, ...args] = modelConfig.tunnelCommand.split(' ')
    
    tunnels[modelId].tunnelProcess = spawn(command, args, {
      shell: true,
      stdio: 'pipe'
    })

    // Handle tunnel process events
    tunnels[modelId].tunnelProcess!.stdout?.on('data', (data) => {
      console.log(`[Tunnel Service] ${modelId} stdout:`, data.toString())
    })

    tunnels[modelId].tunnelProcess!.stderr?.on('data', (data) => {
      console.log(`[Tunnel Service] ${modelId} stderr:`, data.toString())
    })

    tunnels[modelId].tunnelProcess!.on('error', (error) => {
      console.error(`[Tunnel Service] ${modelId} tunnel error:`, error)
      tunnelStatus[modelId] = false
    })

    tunnels[modelId].tunnelProcess!.on('close', (code) => {
      console.log(`[Tunnel Service] ${modelId} tunnel closed with code ${code}`)
      tunnelStatus[modelId] = false
      stopKeepAlive(modelId)
    })

    // Wait for tunnel to be established
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Start keep-alive ping
    startKeepAlive(modelId)
    tunnelStatus[modelId] = true
    
    return true
  } catch (error) {
    console.error(`[Tunnel Service] Failed to create ${modelId} tunnel:`, error)
    return false
  }
}

// Helper to ping the tunnel endpoint to keep it alive
async function pingTunnel(modelId: 'remote-a6000' | 'remote-blackwell'): Promise<boolean> {
  const endpoints = {
    'remote-a6000': 'http://localhost:5001/api/generate',
    'remote-blackwell': 'http://129.10.156.97:8000/v1/chat/completions'
  }

  try {
    const response = await fetch(endpoints[modelId], {
      method: 'HEAD'
    })
    tunnels[modelId].lastPingTime = Date.now()
    return response.ok
  } catch (error) {
    console.error(`[Tunnel Service] ${modelId} ping failed:`, error)
    return false
  }
}

// Start keep-alive pings for a tunnel
function startKeepAlive(modelId: 'remote-a6000' | 'remote-blackwell') {
  if (tunnels[modelId].keepAliveInterval) {
    clearInterval(tunnels[modelId].keepAliveInterval)
  }

  tunnels[modelId].keepAliveInterval = setInterval(async () => {
    const isAlive = await pingTunnel(modelId)
    if (!isAlive) {
      console.log(`[Tunnel Service] ${modelId} tunnel appears to be down, attempting to reconnect...`)
      await createTunnel(modelId)
    }
  }, 30000) // Ping every 30 seconds
}

// Stop keep-alive pings for a tunnel
function stopKeepAlive(modelId: 'remote-a6000' | 'remote-blackwell') {
  if (tunnels[modelId].keepAliveInterval) {
    clearInterval(tunnels[modelId].keepAliveInterval)
    tunnels[modelId].keepAliveInterval = null
  }
}

// Close a specific tunnel
export async function closeTunnel(modelId: 'remote-a6000' | 'remote-blackwell') {
  if (tunnels[modelId].tunnelProcess) {
    tunnels[modelId].tunnelProcess.kill()
    tunnels[modelId].tunnelProcess = null
  }
  stopKeepAlive(modelId)
  tunnelStatus[modelId] = false
}

// Warmup connection to both remote LLMs
export async function warmupConnections() {
  console.log('[Tunnel Service] Warming up remote LLM connections...')
  
  const a6000Status = await createTunnel('remote-a6000')
  const blackwellStatus = await createTunnel('remote-blackwell')
  
  return {
    a6000Connected: a6000Status,
    blackwellConnected: blackwellStatus
  }
}

// Check tunnel status
export function getTunnelStatus() {
  return {
    'remote-a6000': {
      connected: tunnelStatus['remote-a6000'],
      lastPing: tunnels['remote-a6000'].lastPingTime
    },
    'remote-blackwell': {
      connected: tunnelStatus['remote-blackwell'],
      lastPing: tunnels['remote-blackwell'].lastPingTime
    }
  }
}

// Cleanup all tunnels (call this when shutting down)
export async function cleanupTunnels() {
  await Promise.all([
    closeTunnel('remote-a6000'),
    closeTunnel('remote-blackwell')
  ])
}