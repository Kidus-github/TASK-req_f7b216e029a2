import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ConflictBanner from '@/components/diagrams/ConflictBanner.vue'

describe('ConflictBanner (direct)', () => {
  it('renders nothing when there is neither a conflict nor a concurrent tab', () => {
    const wrapper = mount(ConflictBanner, {
      props: { conflictType: '', concurrentTab: false },
    })
    expect(wrapper.find('.conflict-banner').exists()).toBe(false)
  })

  it('renders the warning variant for a concurrent tab with no explicit conflict', () => {
    const wrapper = mount(ConflictBanner, {
      props: { conflictType: '', concurrentTab: true },
    })
    const banner = wrapper.get('.conflict-banner')
    expect(banner.classes()).toContain('warning')
    expect(banner.text()).toContain('This diagram is open in another tab')
    // The warning variant should NOT show Refresh/Duplicate/Ignore actions
    expect(wrapper.find('.banner-actions').exists()).toBe(false)
  })

  it('renders the danger variant for a newer_version conflict with the full action set', async () => {
    const wrapper = mount(ConflictBanner, {
      props: { conflictType: 'newer_version', concurrentTab: false },
    })
    const banner = wrapper.get('.conflict-banner')
    expect(banner.classes()).toContain('danger')
    expect(banner.text()).toContain('A newer version was saved from another tab.')

    const buttons = wrapper.findAll('.banner-actions button').map((b) => b.text())
    expect(buttons).toEqual(['Refresh to Latest', 'Duplicate My Work', 'Ignore (60s)'])
  })

  it('renders the generic danger copy for a hash_mismatch conflict', () => {
    const wrapper = mount(ConflictBanner, {
      props: { conflictType: 'hash_mismatch', concurrentTab: false },
    })
    expect(wrapper.get('.conflict-banner').text()).toContain('A conflicting version exists.')
  })

  it('emits refresh, duplicate, and ignore events from the action buttons', async () => {
    const wrapper = mount(ConflictBanner, {
      props: { conflictType: 'newer_version' },
    })
    const buttons = wrapper.findAll('.banner-actions button')
    await buttons[0].trigger('click')
    await buttons[1].trigger('click')
    await buttons[2].trigger('click')

    expect(wrapper.emitted('refresh')).toHaveLength(1)
    expect(wrapper.emitted('duplicate')).toHaveLength(1)
    expect(wrapper.emitted('ignore')).toHaveLength(1)
  })

  it('hides the warning if both concurrentTab and a hard conflict are set (danger wins)', () => {
    const wrapper = mount(ConflictBanner, {
      props: { conflictType: 'newer_version', concurrentTab: true },
    })
    // The warning variant is conditional on `!conflictType` — it must not render when there is a conflict
    const banners = wrapper.findAll('.conflict-banner')
    expect(banners).toHaveLength(1)
    expect(banners[0].classes()).toContain('danger')
  })
})
