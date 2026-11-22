import HttpUtils from '@/plugins/httputil'
import { defineStore } from 'pinia'
import { push } from 'notivue'
import { i18n } from '@/locales'
import { Inbound } from '@/types/inbounds'
import { Client } from '@/types/clients'
import { Outbound } from '@/types/outbounds'
import { Srv } from '@/types/services'
import { Endpoint } from '@/types/endpoints'
import { Config } from '@/types/config'
import { tls } from '@/types/tls'

// Online tags, by kind. The backend marks each list `omitempty`, so a poll
// with nobody online answers with {} rather than three empty lists. Every
// reader guards accordingly.
export interface Onlines {
  inbound?: string[]
  outbound?: string[]
  user?: string[]
  userCounts?: Record<string, number>
  rejectionUsers?: string[]
  // Devices connected per inbound tag, once the backend reports them. Until
  // it does, readers fall back to presence in `inbound`.
  inboundCounts?: Record<string, number>
}

// zhdata runs as its own processes outside the embedded core, so the panel --
// which drives every one of their admin calls anyway -- is the only thing that
// can tell whether they are up and whether the users it pushed actually got
// in. The backend samples those calls and reports the outcome per zhdata
// inbound; an empty array means there is no zhdata inbounds, and then nothing
// is shown. (docs/zhdata-admin-api.md, service/zhdata.go in the panel.)
export interface ZhdataUserSource {
  path: string
  // Keys this -users source yielded at the core's last reload.
  keys: number
  // Why the core could not read this source. A wrong path keeps the process
  // running on the sources that did load, so this is the only trace.
  lastError?: string
  at?: number
}

export interface ZhdataWarning {
  code: 'down' | 'user_source' | 'key_mismatch' | 'bad_options' | 'no_admin_addr'
  // The sentence to display: the backend words it (English or Chinese, per
  // its own locale) and the UI renders it as-is; code is only for logic.
  detail: string
}

export interface ZhdataHealth {
  // The zhdata inbound this process was started for -- the join key.
  tag: string
  adminAddr?: string
  reachable?: boolean
  version?: string
  // The three user counts meant to be compared: what the panel last pushed,
  // what it thinks it serves, and what the core says it actually holds. A
  // core below the panel count is a push that did not stick.
  pushedUsers?: number
  panelUsers?: number
  coreKeys?: number
  // The core's -users sources, reported only by zhdata >= 0.15.4; older
  // cores leave them out, which by itself is not a problem.
  userSources?: ZhdataUserSource[]
  // The admin call that failed last, already prefixed with which one it was.
  lastError?: string
  lastOkAt?: number
  lastErrAt?: number
  warnings?: ZhdataWarning[]
}

// Everything the panel keeps in sync with api/load. Only `onlines`,
// `maintenance` and sometimes `lastLog` ride on every poll; the rest is sent
// only when something actually changed since the last one, which is why every
// field here is optional and setNewData tests for presence before assigning.
export interface LoadedData {
  onlines?: Onlines
  // Rides the same 10 s poll (the live probe behind it is throttled in the
  // backend); GET api/zhdataHealth answers with the same array as obj.
  zhdataHealth?: ZhdataHealth[]
  maintenance?: boolean
  lastLog?: string
  subURI?: string
  os?: string
  enableTraffic?: boolean
  config?: Config
  clients?: Client[]
  inbounds?: Inbound[]
  outbounds?: Outbound[]
  services?: Srv[]
  endpoints?: Endpoint[]
  tls?: tls[]
}

// The duplicate-tag check works on any of the four lists without caring which
// one it was handed.
type Tagged = Inbound | Outbound | Srv | Endpoint

const Data = defineStore('Data', {
  state: () => ({ 
    lastLoad: 0,
    reloadItems: localStorage.getItem("reloadItems")?.split(',')?? <string[]>[],
    subURI: "",
    os: "",
    enableTraffic: false,
    // The core is stopped on purpose. Polled with the rest so every page can
    // say so, not just the one that turned it on.
    maintenance: false,
    onlines: <Onlines>{inbound: [], outbound: [], user: []},
    zhdataHealth: <ZhdataHealth[]>[],
    config: <Config>{},
    inbounds: <Inbound[]>[],
    outbounds: <Outbound[]>[],
    services: <Srv[]>[],
    endpoints: <Endpoint[]>[],
    clients: <Client[]>[],
    tlsConfigs: <tls[]>[],
  }),
  getters: {
    // The health array arrives ordered with the inbounds, while every card
    // wants its own entry; key it by tag once per poll instead of scanning
    // the array per card (same role inboundCounts plays for the cards).
    zhdataByTag(state): Map<string, ZhdataHealth> {
      return new Map(state.zhdataHealth.map(h => [h.tag, h]))
    },
    // The entries worth warning about anywhere in the panel. The backend
    // flags a dead process with a warning, but reachable === false without
    // one must still not read as healthy.
    zhdataProblems(state): ZhdataHealth[] {
      return state.zhdataHealth.filter(h => h.reachable === false || (h.warnings?.length ?? 0) > 0)
    },
  },
  actions: {
    async loadData() {
      const msg = await HttpUtils.get<LoadedData>('api/load', this.lastLoad >0 ? {lu: this.lastLoad} : {} )
      if(msg.success) {
        if (msg.obj.onlines) this.onlines = msg.obj.onlines
        this.maintenance = msg.obj.maintenance ?? false
        if (msg.obj.lastLog) {
          push.error({
            title: i18n.global.t('error.core'),
            duration: 5000,
            message: msg.obj.lastLog
          })
        }
        
        if (msg.obj.config) {
          this.setNewData(msg.obj)
        }
      }
    },
    setNewData(data: LoadedData) {
      this.lastLoad = Math.floor((new Date()).getTime()/1000)
      if (data.subURI) this.subURI = data.subURI
      if (data.os) this.os = data.os
      // hasOwn, not truthiness: turning traffic accounting off sends false,
      // which the old test discarded, so the panel kept showing it as on until
      // the page was reloaded.
      if (Object.hasOwn(data, 'enableTraffic')) this.enableTraffic = data.enableTraffic ?? false
      if (data.config) this.config = data.config
      if (Object.hasOwn(data, 'clients')) this.clients = data.clients ?? []
      if (Object.hasOwn(data, 'inbounds')) this.inbounds = data.inbounds ?? []
      if (Object.hasOwn(data, 'outbounds')) this.outbounds = data.outbounds ?? []
      if (Object.hasOwn(data, 'services')) this.services = data.services ?? []
      if (Object.hasOwn(data, 'endpoints')) this.endpoints = data.endpoints ?? []
      if (Object.hasOwn(data, 'tls')) this.tlsConfigs = data.tls ?? []
      if (Object.hasOwn(data, 'zhdataHealth')) this.zhdataHealth = data.zhdataHealth ?? []
    },
    async loadInbounds(ids: number[]): Promise<Inbound[]> {
      const options = ids.length > 0 ? {id: ids.join(",")} : {}
      const msg = await HttpUtils.get<{ inbounds: Inbound[] }>('api/inbounds', options)
      if(msg.success) {
        return msg.obj.inbounds
      }
      return <Inbound[]>[]
    },
    async loadClients(id: number): Promise<Client> {
      const options = id > 0 ? {id: id} : {}
      const msg = await HttpUtils.get<{ clients: Client[] }>('api/clients', options)
      if(msg.success) {
        return <Client>msg.obj.clients[0]??{}
      }
      return <Client>{}
    },
    async save (object: string, action: string, data: unknown, initUsers?: number[]): Promise<boolean> {
      const postData = {
        object: object,
        action: action,
        data: JSON.stringify(data, null, 2),
        initUsers: initUsers?.join(',') ?? undefined
      }
      const msg = await HttpUtils.post<LoadedData>('api/save', postData)
      if (msg.success) {
        const objectName = ['tls', 'config'].includes(object) ? object : object.substring(0, object.length - 1)
        push.success({
          title: i18n.global.t('success'),
          duration: 5000,
          message: i18n.global.t('actions.' + action) + " " + i18n.global.t('objects.' + objectName)
        })
        this.setNewData(msg.obj)
      }
      return msg.success
    },
    // Check duplicate client name
    checkClientName (id: number, newName: string): boolean {
      const oldName = id > 0 ? this.clients.findLast(i => i.id == id)?.name : null
      if (newName != oldName && this.clients.findIndex(c => c.name == newName) != -1) {
        push.error({
          message: i18n.global.t('error.dplData') + ": " + i18n.global.t('client.name')
        })
        return true
      }
      return false
    },
    // Check bulk client names
    checkBulkClientNames (names: string[]): boolean {
      const newNames = new Set(names)
      const oldNames = new Set(this.clients.map(c => c.name))
      const allNames = new Set([...oldNames, ...newNames])
      if (newNames.size != names.length || oldNames.size + newNames.size != allNames.size) {
        push.error({
          message: i18n.global.t('error.dplData') + ": " + i18n.global.t('client.name')
        })
        return true
      }
      return false
    },
    // check duplicate tag
    checkTag (object: string, id: number, tag: string): boolean {
      let objects: Tagged[]
      switch (object) {
        case 'inbound':
          objects = this.inbounds
          break
        case 'outbound':
          objects = this.outbounds
          break
        case 'service':
          objects = this.services
          break
        case 'endpoint':
          objects = this.endpoints
          break
        default:
          return false
      }
      const oldObject = id > 0 ? objects.findLast(i => i.id == id) : null
      if (tag != oldObject?.tag && objects.findIndex(i => i.tag == tag) != -1) {
        push.error({
          message: i18n.global.t('error.dplData') + ": " + i18n.global.t('objects.tag')
        })
        return true
      }
      return false
    },
  }
})

export default Data