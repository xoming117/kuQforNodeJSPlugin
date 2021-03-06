/**
 * Created by haozi on 2/11/2017.
 */

import {createSocket, Socket} from 'dgram'
import {EventEmitter} from 'events'
import Timer = NodeJS.Timer
import {unescape} from "querystring"
import {v4} from 'uuid'

/**
 * socket客户端初始化参数
 */
interface ISocketConnectInitParm {
    /**
     * 服务器端口
     */
    serverPort?: number
    /**
     * 客户端端口
     */
    clientPort?: number
    /**
     * 服务器host
     */
    serverHost?: string,
    /**
     * 是否同步推送
     */
    async?: boolean
}

interface ICoolqMessage {
    /**
     * 消息唯一ID
     */
    messageId: string,
    /**
     * 时间戳
     */
    timeStamp: number,
    /**
     * 内容
     */
    content: string[],
    /**
     *  SocketClinet
     */
    app: SocketClinet
}


type middlewareI = (ctx: ICoolqMessage, next: Promise<void>) => void


/**
 *  socket连接类
 */
export class SocketClinet extends EventEmitter {
    private middleWares: middlewareI[]
    private serverSocket: Socket
    private clientSocket: Socket
    private serverPort: number
    private clientPort: number
    private Host: string
    private heart: Timer
    private _callback: Promise<ICoolqMessage>
    private isOpen: boolean

    /**
     *
     * @param serverPort
     * @param clientPort
     * @param serverHost
     * @constructor
     */
    constructor() {
        super()
        this.middleWares = []
    }

    /**
     * 
     * @param parm ISocketConnectInitParm
     */
    public async init(parm: ISocketConnectInitParm = {}): Promise<void> {
       try {
           await this.close()
           this.serverSocket = createSocket('udp4')
           this.clientSocket = createSocket('udp4')
           this.clientPort = parm.clientPort || 27788
           this.serverPort = parm.serverPort || 11235
           this.serverSocket.bind(this.clientPort)
           this.Host = parm.serverHost || '127.0.0.1'
           this.listener()
           const rinfo = await this.send(this.serverHello())
           this.emit('connect', rinfo)
           this.heartRateService()
       }catch (e) {
           throw e
       }
    }

    private listener(): void {
        /**
         *
         */
        this.clientSocket.on('message', (mag: string) => {
        })
        /**
         *
         */
        this.serverSocket.on('error', (err: Error) => {
            console.log(`server error:\n${err.stack}`)
            this.serverSocket.close()
        })
        /**
         *
         */
        this.serverSocket.on('message', (msg: string, rinfo) => {
            this.callback()({
                messageId: v4(),
                timeStamp: new Date().getTime(),
                content: (new Buffer(msg, 'base64').toString()).split(' '),
                app: this
            })
        })
        /**
         *
         */
        this.serverSocket.on('listening', () => {
            const address = this.serverSocket.address()
            console.log(`server listening ${address.address}:${address.port}`)
        })
        /**
         *
         */
        this.on('send', (data: string) => {
            this.send(data)
        })
    }

    /**
     * 向服务器发送socket数据
     * @param data 数据
     * @returns {Promise<void>|Promise|IThenable<void>}
     * @public
     */
    public send(data: string): Promise<void> {
        return new Promise<void>((s: (value?: any) => void, j: (err: Error) => void) => {
            this.clientSocket.send(data, 0, data.length, this.serverPort, this.Host, (err) => {
                if (err) {
                    j(err)
                } else {
                    s()
                }
            })
        })
    }

    /**
     * 构造clienthello信息
     * @returns {string}
     * @private
     */
    private serverHello(): string {
        return `ClientHello ${this.clientPort}`
    }

    /**
     * 发送心跳包
     * 30秒一次
     */
    private heartRateService(): void {
        this.heart = setInterval(() => {
            this.send(this.serverHello())
        }, 300000)
    }


    /**
     * 将所有中间件组合起来
     * @param middleware 中间件的数组
     * @returns {(ctx:Context, next?:Promise)=>any}
     * @api private
     */
    private compose<T>(middleware: middlewareI[]) {
        return (ctx: ICoolqMessage, next?: Promise<void>) => {
            // 定义索引表示执行到了第几个
            let index: number = 0
            // 定义处理函数
            const dispatch = (i: number) => {
                // 更新索引
                index = i
                // 判断中间件是否存在 否则执行挂起的中间件
                const cb: any = middleware[i] || next
                // 如果都不存在 就返回一个resolved形态的Promise
                if (!cb) {
                    return Promise.resolve()
                }
                // 捕获执行过程中的异常 并以rejected形态的Promise对象抛出
                try {
                    // Promise.resolve的方法传入一个thenable的对象(可以then的) 返回的promise会跟随这个thenable对象直到返回resolve状态
                    // https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Promise/resolve  mdn参考
                    // 当中间件await 的时候 递归执行 dispatch 函数调用下一个中间件
                    return Promise.resolve(cb(ctx, ():any =>{
                        return dispatch(i + 1)
                    }))
                }catch (err) {
                    return Promise.reject(err)
                }
            }
            // 执行第一个中间件
            return dispatch(0)
        }
    }

    private callback(): (ctx: ICoolqMessage) => void {
        const fn = this.compose(this.middleWares)
        return (ctx) => {
            fn(ctx).then(() => false).catch()
        }
    }

    private async close() {
        if(this.clientSocket){
            await this.closeSocket(this.clientSocket)
            this.clientSocket = null
        }
        if(this.serverSocket){
            await this.closeSocket(this.serverSocket)
            this.serverSocket = null
        }
    }

    private closeSocket(socket: Socket) {
        return new Promise((s, j) => {
            socket.close(() => {
                s()
            })
        })
    }

    public use(fn: middlewareI): SocketClinet {
        this.middleWares.push(fn)
        return this
    }

    /**
     * 开始监听
     * 这个函数必须在use完成后调用
     * @param serverPort
     * @param clientPort
     * @param serverHost
     */
    public listen(param?: ISocketConnectInitParm) {
        return this.init(param)
    }
}
