/**
 * WebSocket Service.
 *
 * Exposes real-time event notification capability to connected students.
 * Safe-fails if WebSockets are not configured or initialized.
 */

class WebSocketService {
  constructor() {
    /** @type {Map<string, Set<any>>} Maps user IDs to sets of socket clients. */
    this.userSockets = new Map()
    this.io = null
  }

  /**
   * Initializes the service with a socket.io instance.
   *
   * @param {any} io  socket.io server instance.
   */
  initialize(io) {
    this.io = io

    io.on("connection", (socket) => {
      const userId = socket.handshake?.query?.userId || socket.handshake?.auth?.userId

      if (userId) {
        if (!this.userSockets.has(userId)) {
          this.userSockets.set(userId, new Set())
        }
        this.userSockets.get(userId).add(socket)
        console.log(`[WebSocket] User ${userId} connected.`)

        socket.on("disconnect", () => {
          const userSet = this.userSockets.get(userId)
          if (userSet) {
            userSet.delete(socket)
            if (userSet.size === 0) {
              this.userSockets.delete(userId)
            }
          }
          console.log(`[WebSocket] User ${userId} disconnected.`)
        })
      }
    })
  }

  /**
   * Sends an event to all active connections of a specific user.
   *
   * @param {string} userId
   * @param {string} event
   * @param {object} payload
   * @returns {boolean} `true` if at least one socket received the event.
   */
  emitToUser(userId, event, payload) {
    console.log(`[WebSocket Broadcast] To: ${userId} | Event: ${event} | Data:`, JSON.stringify(payload))

    // If socket.io is initialized, use it to emit
    if (this.io) {
      this.io.to(userId).emit(event, payload)
      return true
    }

    // Direct socket reference mapping fallback (for plain ws or custom wrappers)
    const sockets = this.userSockets.get(userId)
    if (sockets && sockets.size > 0) {
      for (const socket of sockets) {
        try {
          socket.emit(event, payload)
        } catch (err) {
          console.error(`[WebSocket] Failed to emit to socket for user ${userId}:`, err.message)
        }
      }
      return true
    }

    return false
  }
}

export const webSocketService = new WebSocketService()
export default webSocketService
