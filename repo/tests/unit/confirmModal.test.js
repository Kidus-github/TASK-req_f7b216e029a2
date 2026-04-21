import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ConfirmModal from '@/components/common/ConfirmModal.vue'

describe('ConfirmModal', () => {
  it('renders default title/message/buttons', () => {
    const wrapper = mount(ConfirmModal)
    expect(wrapper.text()).toContain('Confirm')
    expect(wrapper.text()).toContain('Are you sure?')
    const buttons = wrapper.findAll('button')
    expect(buttons.map((b) => b.text())).toEqual(['Cancel', 'Confirm'])
  })

  it('renders custom title, message, and button labels from props', () => {
    const wrapper = mount(ConfirmModal, {
      props: {
        title: 'Delete item?',
        message: 'This cannot be undone.',
        confirmText: 'Delete',
        cancelText: 'Keep',
      },
    })
    expect(wrapper.text()).toContain('Delete item?')
    expect(wrapper.text()).toContain('This cannot be undone.')
    const [cancel, confirm] = wrapper.findAll('button')
    expect(cancel.text()).toBe('Keep')
    expect(confirm.text()).toBe('Delete')
  })

  it('applies btn-danger to confirm button when danger is true', () => {
    const wrapper = mount(ConfirmModal, { props: { danger: true } })
    const buttons = wrapper.findAll('button')
    expect(buttons[1].classes()).toContain('btn-danger')
    expect(buttons[1].classes()).not.toContain('btn-primary')
  })

  it('applies btn-primary to confirm button when danger is false', () => {
    const wrapper = mount(ConfirmModal, { props: { danger: false } })
    const buttons = wrapper.findAll('button')
    expect(buttons[1].classes()).toContain('btn-primary')
  })

  it('emits confirm when the confirm button is clicked', async () => {
    const wrapper = mount(ConfirmModal)
    await wrapper.findAll('button')[1].trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toBeUndefined()
  })

  it('emits cancel when the cancel button is clicked', async () => {
    const wrapper = mount(ConfirmModal)
    await wrapper.findAll('button')[0].trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('emits cancel when overlay is clicked (click.self on overlay)', async () => {
    const wrapper = mount(ConfirmModal)
    await wrapper.find('.modal-overlay').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('does not emit cancel when clicking inside the modal body (click.self guard)', async () => {
    const wrapper = mount(ConfirmModal)
    await wrapper.find('.modal').trigger('click')
    expect(wrapper.emitted('cancel')).toBeUndefined()
  })
})
