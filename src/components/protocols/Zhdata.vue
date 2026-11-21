<template>
  <v-card>
    <v-card-subtitle v-if="direction != 'out_json'">
      zhdata
    </v-card-subtitle>
    <v-row>
      <v-col
        cols="12"
        sm="6"
        md="4"
      >
        <!-- The zhdata core binds a comma-separated port list. Keep the raw
             text so ranges like "49888-49951" can be typed, and commit the
             expanded numbers to listen_ports on every change; the parsed chips
             show what was actually understood. -->
        <v-text-field
          v-model="portsText"
          :label="$t('types.zhdata.ports')"
          hide-details
          placeholder="49888, 49889-49951"
          @update:model-value="commitPorts"
        />
      </v-col>
      <v-col
        cols="12"
        sm="6"
        md="4"
      >
        <v-text-field
          v-model="data.listen"
          :label="$t('in.addr')"
          hide-details
          placeholder="::"
        />
      </v-col>
      <v-col
        v-if="parsedPorts.length"
        cols="12"
      >
        <v-chip
          v-for="port in parsedPorts"
          :key="port"
          size="small"
          class="ma-1"
        >
          {{ port }}
        </v-chip>
      </v-col>
    </v-row>
    <v-row>
      <v-col
        cols="12"
        sm="6"
        md="4"
      >
        <!-- backend is one string the core reads: "direct" or
             "socks <host:port>". The picker edits that string; a legacy value
             nobody touches round-trips untouched. -->
        <v-select
          v-model="backendMode"
          :label="$t('types.zhdata.backend')"
          :items="backendModes"
          :hint="$t('types.zhdata.backendHint')"
          persistent-hint
          @update:model-value="applyBackendMode"
        />
      </v-col>
      <v-col
        cols="12"
        sm="6"
        md="4"
      >
        <v-text-field
          v-model.number="maxSessions"
          :label="$t('types.zhdata.maxSessions')"
          hide-details
          type="number"
          min="0"
        />
      </v-col>
      <v-col
        cols="12"
        sm="6"
        md="4"
      >
        <v-text-field
          v-model="data.decoy"
          :label="$t('types.zhdata.decoy')"
          hide-details
          clearable
          @click:clear="delete data.decoy"
        />
      </v-col>
    </v-row>
    <v-row v-if="backendMode == 'socks'">
      <v-col
        cols="12"
        sm="6"
        md="4"
      >
        <v-text-field
          v-model="backendAddr"
          :label="$t('types.zhdata.backendAddr')"
          hide-details
          placeholder="127.0.0.1:1080"
          @update:model-value="applyBackendAddr"
        />
      </v-col>
      <v-col
        v-if="socksCandidates.length"
        cols="12"
        sm="6"
        md="4"
      >
        <!-- The panel's own socks inbounds are the usual targets; picking one
             fills the address with its local endpoint, and typing over the
             field is still allowed. -->
        <v-select
          v-model="pickedSocks"
          :label="$t('types.zhdata.socksInbounds')"
          :items="socksCandidates"
          hide-details
          @update:model-value="pickSocks"
        />
      </v-col>
    </v-row>
    <v-row>
      <v-col
        cols="12"
        sm="6"
        md="4"
      >
        <v-text-field
          v-model="data.admin_addr"
          :label="$t('types.zhdata.adminAddr')"
          hide-details
          placeholder="127.0.0.1:6070"
        />
      </v-col>
      <v-col
        cols="12"
        sm="6"
        md="4"
      >
        <v-text-field
          v-model="data.admin_token"
          :label="$t('types.zhdata.adminToken')"
          hide-details
          clearable
          :append-inner-icon="direction == 'in' ? 'mdi-refresh' : undefined"
          @click:append-inner="generateAdminToken"
          @click:clear="delete data.admin_token"
        />
      </v-col>
    </v-row>
    <v-row>
      <v-col cols="12">
        <!-- Comma-separated host:port list. The raw text stays editable while
             typing; only well-formed entries reach the options. An empty list
             drops the key entirely, which is the core's "disabled" state. -->
        <v-text-field
          v-model="upstreamText"
          :label="$t('types.zhdata.upstream')"
          :hint="$t('types.zhdata.upstreamHint')"
          persistent-hint
          placeholder="1.2.3.4:49888, 1.2.3.4:49889"
          @update:model-value="commitUpstream"
        />
      </v-col>
    </v-row>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import RandomUtil from '@/plugins/randomUtil'
import { Inbound, InTypes } from '@/types/inbounds'
import { Outbound } from '@/types/outbounds'
import Data from '@/store/modules/data'

// Inbound side of the zhdata external core (the outbound form lives in
// ZhdataOut.vue); the shape is the core's own option names per
// docs/zhdata-admin-api.md §2.
interface ZhdataData {
  listen: string
  listen_ports: number[]
  backend?: string
  max_sessions?: number
  decoy?: string
  admin_addr?: string
  admin_token?: string
  upstream?: string[]
}

// The parent owns the object and this component edits it in place, so it is a
// model rather than a plain prop.
const model = defineModel<Inbound | Outbound>('data', { required: true })

// The parent holds a union and picks this component with a v-if on the type,
// which the template checker cannot follow, so narrow once here. The computed
// returns the same object, so edits still reach the parent.
const data = computed(() => model.value as unknown as ZhdataData)

defineProps<{
  direction: 'in' | 'out' | 'out_json'
}>()

// Comma or space separated entries; "a-b" expands to the closed range.
function parsePorts(text: string): number[] {
  const ports = new Set<number>()
  for (const token of text.split(/[,\s]+/)) {
    if (!token) continue
    const range = token.match(/^(\d+)\s*-\s*(\d+)$/)
    if (range) {
      const start = Number(range[1])
      const end = Number(range[2])
      if (start >= 1 && end <= 65535 && start <= end && end - start < 65535) {
        for (let port = start; port <= end; port++) ports.add(port)
      }
      continue
    }
    const port = Number(token)
    if (Number.isInteger(port) && port >= 1 && port <= 65535) ports.add(port)
  }
  return [...ports].sort((a, b) => a - b)
}

const portsText = ref((data.value.listen_ports ?? []).join(', '))
const parsedPorts = computed(() => data.value.listen_ports ?? [])

function commitPorts(text: string | null) {
  data.value.listen_ports = parsePorts(text ?? '')
}

// 0 (and an unset field) means no cap in the zhdata core, so clearing drops
// the key instead of writing an empty string.
const maxSessions = computed({
  get: (): number | undefined => data.value.max_sessions,
  set: (v: number | null) => {
    if (v == undefined || Number.isNaN(v)) delete data.value.max_sessions
    else data.value.max_sessions = v
  },
})

// backend is one string the core reads: "direct" or "socks <host:port>".
// It is parsed into display state once; the string is rewritten only when a
// control is touched, so a legacy value nobody edits round-trips untouched.
type BackendMode = 'direct' | 'socks'

function parseBackend(raw: unknown): { mode: BackendMode, addr: string } {
  const value = String(raw ?? 'direct').trim()
  if (value === '' || value === 'direct') return { mode: 'direct', addr: '' }
  const socks = value.match(/^socks(?:\s+(.*))?$/i)
  if (socks) return { mode: 'socks', addr: (socks[1] ?? '').trim() }
  // Any other non-direct string reads as an address; the old string is kept
  // verbatim until one of the fields rewrites it.
  return { mode: 'socks', addr: value }
}

const backendParsed = parseBackend(data.value.backend)
const backendMode = ref<BackendMode>(backendParsed.mode)
const backendAddr = ref(backendParsed.addr)
const pickedSocks = ref('')

const backendModes = [
  { title: 'direct', value: 'direct' },
  { title: 'socks', value: 'socks' },
]

// The panel's own socks inbounds, labelled by tag and port.
const socksCandidates = computed(() =>
  (Data().inbounds ?? [])
    .filter(inbound => inbound.type === InTypes.SOCKS)
    .map(inbound => ({
      title: `${inbound.tag} (${inbound.listen_port})`,
      value: `127.0.0.1:${inbound.listen_port}`,
    }))
)

function applyBackendMode(mode: unknown) {
  data.value.backend = mode === 'socks' ? `socks ${backendAddr.value}`.trim() : 'direct'
}

function applyBackendAddr(addr: string | null) {
  data.value.backend = `socks ${addr ?? ''}`.trim()
}

function pickSocks(addr: unknown) {
  if (typeof addr !== 'string' || !addr) return
  backendAddr.value = addr
  data.value.backend = `socks ${addr}`
}

function generateAdminToken() {
  data.value.admin_token = RandomUtil.randomSeq(32)
}

// host:port entries (bracketed IPv6 hosts allowed), deduped in input order.
function parseUpstream(text: string): string[] {
  const list: string[] = []
  const seen = new Set<string>()
  for (const token of text.split(/[,\s]+/)) {
    if (!token) continue
    const entry = token.match(/^(\[[0-9a-fA-F:.]+\]|[^:\s,[\]]+):(\d{1,5})$/)
    if (!entry) continue
    const port = Number(entry[2])
    if (port < 1 || port > 65535) continue
    const hostPort = `${entry[1]}:${port}`
    if (!seen.has(hostPort)) {
      seen.add(hostPort)
      list.push(hostPort)
    }
  }
  return list
}

const upstreamText = ref((data.value.upstream ?? []).join(', '))

function commitUpstream(text: string | null) {
  const list = parseUpstream(text ?? '')
  if (list.length) data.value.upstream = list
  else delete data.value.upstream // missing = upstream off for the core
}
</script>
