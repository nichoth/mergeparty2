import { html } from 'htm/preact'
import { type FunctionComponent } from 'preact'

interface Props {
    id?:string
    class?:string
    name:string
    legend:string
    options:Array<{ value:string; label:string; }>
    required?:boolean
    value?:string
    onChange?:(value:string) => void
}

export const RadioGroup:FunctionComponent<Props> = function (props) {
    const {
        class: className,
        name,
        options,
        legend,
        required,
        id,
        value,
        onChange
    } = props

    const classes = [className, 'form-group', 'radios']
        .filter(Boolean)
        .map(name => name?.trim())
        .join(' ')

    return html`
        <fieldset class="${classes}" id=${id}>
            <legend>${legend}</legend>
            ${options.map((opt, i) => {
                return html`
                    <label key=${i} class="radio-input">
                        <input 
                            type="radio" 
                            name=${name} 
                            required=${required}
                            value=${opt.value}
                            checked=${value === opt.value}
                            onchange=${(e:Event) => {
                                const target = e.target as HTMLInputElement
                                onChange?.(target.value)
                            }}
                        />
                        <span>${opt.label}</span>
                    </label>
                `
            })}
        </fieldset>
    `
}
