import { describe, it, expect, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as vuetifyComponents from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { i18n } from '@/locales'
import { push } from 'notivue'
import ZhdataCoreBar from './ZhdataCoreBar.vue'

// The bar's whole contract is the pair api/zhdataCore GET/POST and the toast
// it raises after an update; none of it may touch the network in a test.
const getMock = vi.fn()
const postMock = vi.fn()
vi.mock('@/plugins/httputil', () => ({
  default: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
  },
}))
vi.mock('notivue', () => ({ push: { error: vi.fn(), success: vi.fn() } }))

const vuetify = createVuetify({ components: vuetifyComponents, directives })

// GET api/zhdataCore obj shapes used below.
const outOfDate = {
  installed: true, path: '/usr/local/s-ui/bin/zhdata/zhdata', external: false,
  current_version: '0.15.4', latest_version: '0.16.0', need_update: true,
  download_asset: 'zhdata-linux-amd64.zip', error: null,
}
const missing = {
  installed: false, path: '', external: false,
  current_version: null, latest_version: '0.16.0', need_update: true,
  download_asset: 'zhdata-linux-amd64.zip', error: null,
}
const checkFailed = {
  installed: true, path: '/usr/local/s-ui/bin/zhdata/zhdata', external: false,
  current_version: '0.15.4', latest_version: null, need_update: false,
  download_asset: '', error: 'github api: unexpected status 502',
}

const mountBar = async (obj: unknown) => {
  getMock.mockReset().mockResolvedValue({ success: true, msg: '', obj })
  // Tooltip content teleports into document.body and would linger across tests.
  document.body.innerHTML = ''
  const wrapper = mount(ZhdataCoreBar, { global: { plugins: [vuetify, i18n] } })
  await flushPromises()
  return wrapper
}

describe('zhdata core bar', () => {
  it('asks the panel for the core state when the inbounds page mounts', async () => {
    const wrapper = await mountBar(outOfDate)
    expect(getMock).toHaveBeenCalledWith('api/zhdataCore')
    expect(wrapper.text()).toContain('Installed 0.15.4')
    expect(wrapper.text()).toContain('Latest 0.16.0')
    wrapper.unmount()
  })

  it('badges a core that has an update and offers the update button', async () => {
    const wrapper = await mountBar(outOfDate)
    expect(wrapper.text()).toContain('Update available')
    // The last button is the update one (refresh comes first).
    const buttons = wrapper.findAllComponents({ name: 'VBtn' })
    expect(buttons.at(-1)?.text()).toContain('Update core')
    wrapper.unmount()
  })

  it('says not installed and offers the download for a machine without the core', async () => {
    const wrapper = await mountBar(missing)
    expect(wrapper.text()).toContain('Not installed')
    const buttons = wrapper.findAllComponents({ name: 'VBtn' })
    expect(buttons.at(-1)?.text()).toContain('Download core')
    wrapper.unmount()
  })

  it('keeps the bar usable and shows the error when the GitHub check failed', async () => {
    const wrapper = await mountBar(checkFailed)
    expect(wrapper.text()).toContain('github api: unexpected status 502')
    // A failed check knows no latest version: no "up to date" badge, and the
    // update button is disabled because there is nothing known to fetch.
    expect(wrapper.text()).not.toContain('Up to date')
    const buttons = wrapper.findAllComponents({ name: 'VBtn' })
    expect(buttons.at(-1)?.find('button').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('hides itself entirely when the backend has no zhdataCore endpoint', async () => {
    getMock.mockReset().mockResolvedValue({ success: false, msg: '404', obj: null })
    const wrapper = mount(ZhdataCoreBar, { global: { plugins: [vuetify, i18n] } })
    await flushPromises()
    expect(wrapper.text()).toBe('')
    wrapper.unmount()
  })

  it('confirms, updates once, and reports from/to and the restarted count', async () => {
    const wrapper = await mountBar(outOfDate)
    const postResult = {
      from: '0.15.4', to: '0.16.0',
      path: '/usr/local/s-ui/bin/zhdata/zhdata', external: false,
      restarted: ['zhdata', 'zhdata-ZH-2'],
    }
    postMock.mockReset().mockResolvedValue({ success: true, msg: '', obj: postResult })
    // The download runs for over a minute; a second click while it is running
    // must not fire a second POST. The confirm is answered here, not by a human.
    const confirmStub = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmStub)

    const buttons = wrapper.findAllComponents({ name: 'VBtn' })
    await buttons.at(-1)?.find('button').trigger('click')
    // Mid-flight: the POST has been issued but has not resolved yet.
    expect(confirmStub).toHaveBeenCalledTimes(1)
    expect(postMock).toHaveBeenCalledWith('api/zhdataCore/update', {})
    await buttons.at(-1)?.find('button').trigger('click')
    expect(postMock).toHaveBeenCalledTimes(1)

    await flushPromises()
    expect(push.success).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'zhdata core 0.15.4 → 0.16.0; restarted 2 process(es)',
      }),
    )
    // The state is re-read after the update: mount's GET plus the post-update one.
    expect(getMock).toHaveBeenCalledTimes(2)
    vi.unstubAllGlobals()
    wrapper.unmount()
  })

  it('aborts the update when the confirmation is refused', async () => {
    const wrapper = await mountBar(outOfDate)
    vi.stubGlobal('confirm', vi.fn(() => false))
    const buttons = wrapper.findAllComponents({ name: 'VBtn' })
    await buttons.at(-1)?.find('button').trigger('click')
    await flushPromises()
    expect(postMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
    wrapper.unmount()
  })
})
