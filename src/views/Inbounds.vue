<template>
  <InboundVue 
    :id="modal.id"
    v-model="modal.visible"
    :visible="modal.visible"
    :in-tags="inTags"
    :tls-configs="tlsConfigs"
    @close="closeModal"
  />
  <Stats
    v-model="stats.visible"
    :visible="stats.visible"
    :resource="stats.resource"
    :tag="stats.tag"
    @close="closeStats"
  />
  <Sessions
    v-model="sessions.visible"
    :visible="sessions.visible"
    resource="inbound"
    :tag="sessions.tag"
    @close="closeSessions"
  />
  <v-row>
    <v-col
      cols="12"
      justify="center"
      align="center"
    >
      <v-btn
        color="primary"
        @click="showModal(0)"
      >
        {{ $t('actions.add') }}
      </v-btn>
    </v-col>
  </v-row>
  <v-row>
    <v-col
      v-for="(item, index) in <any[]>inbounds"
      :key="item.tag"
      cols="12"
      sm="4"
      md="3"
      lg="2"
    >
      <v-card
        rounded="xl"
        elevation="5"
        min-width="200"
        :title="item.tag"
      >
        <v-card-subtitle style="margin-top: -15px;">
          <v-row>
            <v-col>{{ item.type }}</v-col>
          </v-row>
        </v-card-subtitle>
        <v-card-text>
          <v-row>
            <v-col>{{ $t('in.addr') }}</v-col>
            <v-col>
              {{ item.listen }}
            </v-col>
          </v-row>
          <v-row>
            <v-col>{{ $t('in.port') }}</v-col>
            <v-col>
              {{ item.listen_port }}
            </v-col>
          </v-row>
          <v-row>
            <v-col>{{ $t('objects.tls') }}</v-col>
            <v-col>
              {{ item.tls_id > 0 ? $t('enable') : $t('disable') }}
            </v-col>
          </v-row>
          <v-row>
            <v-col>{{ $t('pages.clients') }}</v-col>
            <v-col>
              <template v-if="item.users">
                <v-tooltip
                  v-if="item.users.length > 0"
                  activator="parent"
                  dir="ltr"
                  location="bottom"
                >
                  <span
                    v-for="u in item.users"
                    :key="u"
                  >{{ u }}<br></span>
                </v-tooltip>
                {{ item.users.length }}
              </template>
              <template v-else>
                -
              </template>
            </v-col>
          </v-row>
          <v-row>
            <v-col>{{ $t('online') }}</v-col>
            <v-col>
              <!-- zhdata is an external core: the panel is the only thing
                   that can say whether the process is up and whether its
                   admin probe found anything wrong. No entry (other
                   protocols, backends that never report health) keeps the
                   device/online marker below exactly as it was. -->
              <template v-if="zhdataHealth(item)">
                <v-chip
                  v-if="!zhdataProblem(item)"
                  density="comfortable"
                  size="small"
                  color="success"
                  variant="flat"
                >
                  {{ $t('types.zhdata.healthOk', { v: zhdataHealth(item)?.version || '?', n: zhdataHealth(item)?.pushedUsers ?? 0 }) }}
                </v-chip>
                <v-chip
                  v-else
                  density="comfortable"
                  size="small"
                  :color="zhdataHealth(item)?.reachable === false ? 'error' : 'warning'"
                  variant="flat"
                >
                  {{ $t('types.zhdata.healthUnhealthy') }}
                  <v-tooltip
                    activator="parent"
                    location="top"
                    max-width="420"
                  >
                    <div
                      v-for="(w, wi) in zhdataHealth(item)?.warnings ?? []"
                      :key="wi"
                    >{{ w.detail }}</div>
                    <div
                      v-if="zhdataHealth(item)?.adminAddr"
                      dir="ltr"
                    >{{ $t('types.zhdata.adminAddr') }}: {{ zhdataHealth(item)?.adminAddr }}</div>
                    <div
                      v-if="zhdataHealth(item)?.lastError"
                      dir="ltr"
                    >{{ $t('types.zhdata.healthLastError') }}: {{ zhdataHealth(item)?.lastError }}</div>
                    <!-- path -> keys per -users source; a broken source's
                         error goes after the count, in red, because the
                         process keeps running on the sources that loaded. -->
                    <div
                      v-for="(s, si) in zhdataHealth(item)?.userSources ?? []"
                      :key="si"
                      dir="ltr"
                    >
                      {{ s.path }} → {{ s.keys }}<span
                        v-if="s.lastError"
                        class="text-red-4"
                      > {{ s.lastError }}</span>
                    </div>
                    <div
                      v-if="(zhdataHealth(item)?.coreKeys ?? 0) < (zhdataHealth(item)?.panelUsers ?? 0)"
                      dir="ltr"
                    >{{ $t('types.zhdata.healthKeyMismatch', { p: zhdataHealth(item)?.pushedUsers ?? 0, m: zhdataHealth(item)?.panelUsers ?? 0, k: zhdataHealth(item)?.coreKeys ?? 0 }) }}</div>
                  </v-tooltip>
                </v-chip>
              </template>
              <!-- Badge the devices actually connected once the backend
                   reports them; the online chip stays as the fallback for
                   backends that only send the tag list. -->
              <template v-if="inboundCounts[item.tag]">
                <v-chip
                  density="comfortable"
                  size="small"
                  color="success"
                  variant="flat"
                  link
                  @click="showSessions(item.tag)"
                >
                  {{ $t('in.deviceCount', { n: inboundCounts[item.tag] }) }}
                  <v-tooltip
                    activator="parent"
                    location="top"
                    :text="$t('sessions.title')"
                  />
                </v-chip>
              </template>
              <template v-else-if="onlines.includes(item.tag)">
                <v-chip
                  density="comfortable"
                  size="small"
                  color="success"
                  variant="flat"
                  link
                  @click="showSessions(item.tag)"
                >
                  {{ $t('online') }}
                  <v-tooltip
                    activator="parent"
                    location="top"
                    :text="$t('sessions.title')"
                  />
                </v-chip>
              </template>
              <template v-else>
                -
              </template>
            </v-col>
          </v-row>
        </v-card-text>
        <v-divider />
        <v-card-actions style="padding: 0;">
          <v-btn
            icon="mdi-file-edit"
            @click="showModal(item.id)"
          >
            <v-icon />
            <v-tooltip
              activator="parent"
              location="top"
              :text="$t('actions.edit')"
            />
          </v-btn>
          <v-btn
            icon="mdi-file-remove"
            style="margin-inline-start:0;"
            color="warning"
            @click="delOverlay[index] = true"
          >
            <v-icon />
            <v-tooltip
              activator="parent"
              location="top"
              :text="$t('actions.del')"
            />
          </v-btn>
          <v-overlay
            v-model="delOverlay[index]"
            contained
            class="align-center justify-center"
          >
            <v-card
              :title="$t('actions.del')"
              rounded="lg"
            >
              <v-divider />
              <v-card-text>{{ $t('confirm') }}</v-card-text>
              <v-card-actions>
                <v-btn
                  color="error"
                  variant="outlined"
                  @click="delInbound(item.id)"
                >
                  {{ $t('yes') }}
                </v-btn>
                <v-btn
                  color="success"
                  variant="outlined"
                  @click="delOverlay[index] = false"
                >
                  {{ $t('no') }}
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-overlay>
          <v-btn
            icon="mdi-content-duplicate"
            :loading="cloneLoading"
            @click="clone(item.id)"
          >
            <v-icon />
            <v-tooltip
              activator="parent"
              location="top"
              :text="$t('actions.clone')"
            />
          </v-btn>
          <v-btn
            v-if="Data().enableTraffic"
            icon="mdi-chart-line"
            @click="showStats(item.tag)"
          >
            <v-icon />
            <v-tooltip
              activator="parent"
              location="top"
              :text="$t('stats.graphTitle')"
            />
          </v-btn>
        </v-card-actions>
      </v-card>      
    </v-col>
  </v-row>
</template>

<script lang="ts" setup>
import Data from '@/store/modules/data'
import type { ZhdataHealth } from '@/store/modules/data'
import InboundVue from '@/layouts/modals/Inbound.vue'
import Stats from '@/layouts/modals/Stats.vue'
import Sessions from '@/layouts/modals/Sessions.vue'
import { computed, ref } from 'vue'
import { createInbound, Inbound } from '@/types/inbounds'
import { tls } from '@/types/tls'
import RandomUtil from '@/plugins/randomUtil'

const inbounds = computed((): Inbound[] => {
  return <Inbound[]> Data().inbounds
})

const tlsConfigs = computed((): tls[] => {
  return Data().tlsConfigs
})

const inTags = computed((): string[] => {
  return [...(inbounds.value?.map(i => i.tag) ?? []), ...(Data().endpoints?.filter(e => e.listen_port > 0).map(e => e.tag) ?? [])]
})

const onlines = computed(() => {
  return Data().onlines.inbound?? []
})

// Devices per inbound tag; an older backend omits the whole map.
const inboundCounts = computed<Record<string, number>>(() => {
  return Data().onlines.inboundCounts ?? {}
})

// The store keys the polled zhdataHealth array by tag -- cards want their own
// entry, not a scan of the array. A card has one only when its protocol is
// zhdata and the backend probed it; undefined keeps the markers above as they
// were. zhdataProblem mirrors the store's zhdataProblems getter.
const zhdataByTag = computed(() => Data().zhdataByTag)
const zhdataHealth = (item: Inbound): ZhdataHealth | undefined =>
  item.type === 'zhdata' ? zhdataByTag.value.get(item.tag) : undefined
const zhdataProblem = (item: Inbound): boolean => {
  const h = zhdataHealth(item)
  return !!h && (h.reachable === false || (h.warnings?.length ?? 0) > 0)
}

const modal = ref({
  visible: false,
  id: 0,
})

let delOverlay = ref(new Array<boolean>)

const showModal = (id: number) => {
  modal.value.id = id
  modal.value.visible = true
}
const closeModal = () => {
  modal.value.visible = false
}

const delInbound = async (id: number) => {
  const index = inbounds.value.findIndex(i => i.id == id)
  const tag = inbounds.value[index].tag

  const success = await Data().save("inbounds", "del", tag)
  if (success) delOverlay.value[index] = false
}

let cloneLoading = ref(false)

const clone = async (id: number) => {
  cloneLoading.value = true
  const inboundArray = await Data().loadInbounds([id])
  const inbound = inboundArray[0]
  let newTag = inbound.type + "-" + RandomUtil.randomSeq(3)
  const newInbound = createInbound(inbound.type, { ...inbound,
    id: 0,
    tag: newTag,
    listen_port: RandomUtil.randomIntRange(10000, 60000),
  })
  await Data().save("inbounds", "new", newInbound)
  cloneLoading.value = false
}

const stats = ref({
  visible: false,
  resource: "inbound",
  tag: "",
})

const showStats = (tag: string) => {
  stats.value.tag = tag
  stats.value.visible = true
}
const closeStats = () => {
  stats.value.visible = false
}

const sessions = ref({
  visible: false,
  tag: "",
})

const showSessions = (tag: string) => {
  sessions.value.tag = tag
  sessions.value.visible = true
}
const closeSessions = () => {
  sessions.value.visible = false
}
</script>