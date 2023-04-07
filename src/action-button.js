import { LitElement, css, html } from 'lit'
import { when } from 'lit/directives/when.js';

export class ActionButton extends LitElement {

	static properties = {
		id: { type: String },
		label: { type: String },
		onClick: { type: Function },
		disable: { type: Boolean }
	};

	async _handleClick(e) {
		if (this.onClick) {
			await this.onClick(e)
		} 
	}

	constructor() {
		super()
		this.label = ''
		this.disable = true
		this.action = async (e) => { }
	}

	render() {

		return when(
			this.label === '',
			() => html`<slot></slot><div></div>`,
			() => html`<div><center><slot></slot><br/><button ?disabled=${this.disable} @click="${this._handleClick}" id="${this.id}">${this.label}</button></center></div>`
		)
	}

	static styles = [
		css`
			:host {
				display: block;
			}
			:host button {
			  border-radius: 12px;
	      padding: 0.5rem;
				margin-bottom: 1rem;
				display: inline-flex;
        align-items: center; 
	      box-shadow: 0 12px 16px 0 rgba(var(--shadow-1), 0.24), 0 17px 50px 0 rgba(0, 0, 0, 0.19);
			}
		`
	];

}

window.customElements.define('action-button', ActionButton)
