import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TextConfirmModal from '@/components/common/TextConfirmModal.vue'

function baseProps(overrides = {}) {
  return {
    title: 'Permanently Delete',
    message: 'Type the confirmation phrase to continue.',
    confirmPhrase: 'DELETE DATA',
    confirmText: 'Delete',
    ...overrides,
  }
}

describe('TextConfirmModal', () => {
  it('renders title, message, and confirm phrase guidance', () => {
    const wrapper = mount(TextConfirmModal, { props: baseProps() })
    expect(wrapper.text()).toContain('Permanently Delete')
    expect(wrapper.text()).toContain('Type the confirmation phrase to continue.')
    expect(wrapper.text()).toContain('DELETE DATA')
    const input = wrapper.get('input[type="text"]')
    expect(input.attributes('placeholder')).toBe('Type confirmation phrase')
  })

  it('uses custom confirmText label on the confirm button', () => {
    const wrapper = mount(TextConfirmModal, {
      props: baseProps({ confirmText: 'Permanently Delete' }),
    })
    const actionButtons = wrapper.findAll('.modal-actions button')
    expect(actionButtons.map((b) => b.text())).toEqual(['Cancel', 'Permanently Delete'])
  })

  it('blocks confirm and shows validation message when input does not match', async () => {
    const wrapper = mount(TextConfirmModal, { props: baseProps() })
    await wrapper.get('input').setValue('wrong')
    const confirmBtn = wrapper.findAll('.modal-actions button')[1]
    await confirmBtn.trigger('click')
    expect(wrapper.emitted('confirm')).toBeUndefined()
    expect(wrapper.text()).toContain('Type exactly: DELETE DATA')
  })

  it('emits confirm only once the input exactly matches the phrase', async () => {
    const wrapper = mount(TextConfirmModal, { props: baseProps() })
    await wrapper.get('input').setValue('DELETE DATA')
    const confirmBtn = wrapper.findAll('.modal-actions button')[1]
    await confirmBtn.trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('emits cancel when the Cancel button is clicked', async () => {
    const wrapper = mount(TextConfirmModal, { props: baseProps() })
    await wrapper.findAll('.modal-actions button')[0].trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('emits cancel when the overlay background is clicked', async () => {
    const wrapper = mount(TextConfirmModal, { props: baseProps() })
    await wrapper.find('.modal-overlay').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('applies btn-danger class on confirm button when danger is true', () => {
    const wrapper = mount(TextConfirmModal, { props: baseProps({ danger: true }) })
    const confirmBtn = wrapper.findAll('.modal-actions button')[1]
    expect(confirmBtn.classes()).toContain('btn-danger')
  })

  it('resets input and error when confirmPhrase prop changes', async () => {
    const wrapper = mount(TextConfirmModal, { props: baseProps() })
    await wrapper.get('input').setValue('not-correct')
    const confirmBtn = wrapper.findAll('.modal-actions button')[1]
    await confirmBtn.trigger('click')
    expect(wrapper.text()).toContain('Type exactly:')

    await wrapper.setProps({ confirmPhrase: 'ANOTHER PHRASE' })
    expect(wrapper.get('input').element.value).toBe('')
    expect(wrapper.text()).not.toContain('Type exactly:')
  })
})
