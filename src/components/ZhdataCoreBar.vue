<template>
  <!-- zhdata is an external core, and since ZY11 the panel hosts its
       download: this bar answers "which core version do the zhdata inbounds
       below actually run?" and offers the update. It sits on the inbounds
       page because that is where the per-inbound health chips live. A
       backend too old to know the endpoint answers with an error, `core`
       stays null, and the whole bar never renders. -->
  <v-card
    v-if="core"
    variant="tonal"
    rounded="lg"
    class="mb-4"
    :loading="loading"
  >
    <v-card-text class="d-flex align-center flex-wrap ga-2 pa-3">
      <v-icon icon="mdi-cube-outline" />
      <span class="text-body-2 font-weight-medium">{{ $t('types.zhdata.coreTitle') }}</span>
      <v-chip
        size="small"
        variant="flat"
        :color="core.installed ? 'success' : 'warning'"
      >
        {{ core.installed
          ? $t('types.zhdata.coreInstalled', { v: core.current_version || '?' })
          : $t('types.zhdata.coreNotInstalled') }}
      </v-chip>
      <v-chip
        v-if="core.latest_version"
        size="small"
        variant="flat"
      >
        {{ $t('types.zhdata.coreLatest', { v: core.latest_version }) }}
      </v-chip>
      <!-- The badge the requirement asks for; "up to date" is its calm twin,
         only shown when a successful check actually says so. -->
      <v-chip
        v-if="core.need_update"
        size="small"
        variant="flat"
        color="primary"
      >
        {{ $t('types.zhdata.coreUpdateAvailable') }}
      </v-chip>
      <v-chip
        v-else-if="core.installed && !core.error"
        size="small"
        variant="flat"
        color="success"
      >
        {{ $t('types.zhdata.coreUpToDate') }}
      </v-chip>
      <!-- external=true: the core still lives at the legacy /opt/zhdata.
         Only the update button can move it, so point at that, don't nag. -->
      <v-chip
        v-if="core.external"
        size="small"
        variant="flat"
        color="warning"
      >
        {{ $t('types.zhdata.coreExternal') }}
        <v-tooltip
          activator="parent"
          location="top"
          max-width="420"
        >
          {{ $t('types.zhdata.coreExternalHint') }}
        </v-tooltip>
      </v-chip>
      <v-spacer />
      <v-btn
        size="small"
        icon="mdi-refresh"
        variant="text"
        :loading="loading"
        @click="load()"
      >
        <v-icon />
        <v-tooltip
          activator="parent"
          location="top"
          :text="$t('actions.refresh')"
        />
      </v-btn>
      <v-btn
        size="small"
        color="primary"
        :loading="updating"
        :disabled="!updatable"
        @click="updateCore"
      >
        {{ core.installed ? $t('types.zhdata.coreUpdate') : $t('types.zhdata.coreDownload') }}
      </v-btn>
    </v-card-text>
    <!-- A failed GitHub check is not fatal: the installed core keeps running,
         the chips above stay as they were, and only this line says why the
         latest version is unknown. -->
    <v-alert
      v-if="core.error"
      type="warning"
      variant="text"
      density="compact"
      class="mx-3 mb-3"
      :text="$t('types.zhdata.coreError', { e: core.error })"
    />
    <v-alert
      v-if="core.external"
      type="info"
      variant="text"
      density="compact"
      class="mx-3 mb-3"
      dir="ltr"
      :text="$t('types.zhdata.coreExternalHint')"
    />
  </v-card>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue'
import { push } from 'notivue'
import { i18n } from '@/locales'
import HttpUtils from '@/plugins/httputil'

// GET api/zhdataCore obj, straight from the backend contract
// (service/zhdata_core.go, docs/zhdata-admin-api.md §2.4).
interface ZhdataCore {
  installed: boolean
  path: string
  external: boolean
  current_version: string | null
  latest_version: string | null
  need_update: boolean
  download_asset: string
  error: string | null
}

// POST api/zhdataCore/update obj.
interface ZhdataUpdateResult {
  from: string | null
  to: string
  path: string
  external: boolean
  restarted: string[]
}

const core = ref<ZhdataCore | null>(null)
const loading = ref(false)
const updating = ref(false)

// Nothing to fetch when the check says we already run the latest; a failed
// check (error, no need_update) still leaves a not-installed core to fetch.
const updatable = computed((): boolean =>
  !!core.value && !updating.value && (core.value.need_update || !core.value.installed))

const load = async () => {
  loading.value = true
  const msg = await HttpUtils.get<ZhdataCore>('api/zhdataCore')
  if (msg.success && msg.obj) core.value = msg.obj
  loading.value = false
}

// Updating rewrites the binary and restarts every zhdata process, so it is
// confirmed rather than done on a single click, like stopping the core on the
// settings page. `updating` stays set across the whole request (download and
// restarts can run past a minute) which is what keeps the button from being
// pressed twice; HttpUtils already toasts a failed update.
const updateCore = async () => {
  if (!updatable.value) return
  if (!confirm(i18n.global.t('types.zhdata.coreUpdateConfirm'))) return

  updating.value = true
  const msg = await HttpUtils.post<ZhdataUpdateResult>('api/zhdataCore/update', {})
  if (msg.success && msg.obj) {
    push.success({
      title: i18n.global.t('success'),
      duration: 8000,
      message: i18n.global.t('types.zhdata.coreUpdated', {
        from: msg.obj.from || '?',
        to: msg.obj.to,
        n: msg.obj.restarted?.length ?? 0,
      }),
    })
    await load()
  }
  updating.value = false
}

onMounted(load)
</script>
