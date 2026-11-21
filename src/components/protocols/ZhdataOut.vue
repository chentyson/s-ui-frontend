<template>
  <v-card subtitle="zhdata">
    <v-row>
      <v-col
        cols="12"
        sm="6"
        md="4"
      >
        <!-- The credential is a client uuid; the field also offers a fresh
             one because outbound zhdata points at someone else's server. -->
        <v-text-field
          v-model="data.uuid"
          :label="$t('types.zhdata.uuid')"
          hide-details
          :append-inner-icon="'mdi-refresh'"
          @click:append-inner="generateUuid"
        />
      </v-col>
      <v-col
        cols="12"
        sm="6"
        md="4"
      >
        <v-text-field
          v-model.number="conns"
          :label="$t('types.zhdata.conns')"
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
          v-model.number="spread"
          :label="$t('types.zhdata.spread')"
          hide-details
          type="number"
          min="0"
        />
      </v-col>
    </v-row>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import RandomUtil from '@/plugins/randomUtil'
import { Outbound } from '@/types/outbounds'

// zhdata is the outbound counterpart of the zhdata inbound: it dials a zhdata
// server over a client uuid. server/server_port live in the shared outbound
// block, this form carries only the credential and the connection knobs.
interface ZhdataOutData {
  uuid: string
  conns?: number
  spread?: number
}

// The parent owns the object and this component edits it in place, so it is a
// model rather than a plain prop.
const model = defineModel<Outbound>('data', { required: true })

// The parent holds a union and picks this component with a v-if on the type,
// which the template checker cannot follow, so narrow once here. The computed
// returns the same object, so edits still reach the parent.
const data = computed(() => model.value as unknown as ZhdataOutData)

// The knobs are optional: an empty field drops the key so the core default
// applies instead of a saved empty string.
function optionalNumber(field: 'conns' | 'spread') {
  return computed({
    get: (): number | undefined => data.value[field],
    set: (v: number | null) => {
      if (v == undefined || Number.isNaN(v)) delete data.value[field]
      else data.value[field] = v
    },
  })
}

const conns = optionalNumber('conns')
const spread = optionalNumber('spread')

function generateUuid() {
  data.value.uuid = RandomUtil.randomUUID()
}
</script>
