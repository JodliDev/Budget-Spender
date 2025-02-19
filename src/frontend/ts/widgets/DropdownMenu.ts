import m, {Component, Vnode, VnodeDOM} from "mithril";
import "./dropdownMenu.css"

const openedMenus: Record<string, DropdownMenuImpl> = {}

export interface DropdownOptions {
	dontCenter?: boolean
	fullScreen?: boolean
	manualPositioning?: boolean
	connectedDropdowns?: string[]
	eventName?: string
	disableMenuPointerEvents?: boolean
	customEvent?: () => void
	updatePositionCallback?: (x: number, y: number) => void
}

class DropdownMenuImpl {
	private readonly id: string
	public readonly view: HTMLElement
	private readonly clickOutsideImpl: (e:Event) => void
	private readonly openerView: Element
	private readonly connectedDropdowns?: string[]
	
	constructor(id: string, openerView: Element, options?: DropdownOptions) {
		this.clickOutsideImpl = this.clickOutside.bind(this)
		this.connectedDropdowns = options?.connectedDropdowns
		this.id = id
		this.openerView = openerView
		this.view = this.createView(id, options)
		window.setTimeout(() => {//if a click event called this, it is not done bubbling. So we have to stall this listener or it will be fired immediately
			document.addEventListener("click", this.clickOutsideImpl)
		}, 200)
	}
	private createView(id: string, options?: DropdownOptions): HTMLElement {
		const view = document.createElement("div")
		view.classList.add("dropdown")
		view.classList.add(id)
		
		if(options?.fullScreen)
			view.style.cssText = "left: 0; right: 0; top: 0; bottom: 0;"
		else if(!options?.manualPositioning) {
			const rect = this.openerView.getBoundingClientRect()
			const x = options?.dontCenter ? rect.left - 6 : rect.left + rect.width / 2 //6 is for padding (5) and border width (1)
			const y = Math.max(0, rect.top + rect.height + 1)
			
			const maxWidth = window.innerWidth
			const maxHeight = window.innerHeight
			
			let transform = "translate(-50%)"
			if(options?.dontCenter)
				transform = "none"
			
			view.style.cssText = `left: ${x}px; top: ${y}px; max-width: ${maxWidth}px; max-height: ${maxHeight}px; transform: ${transform};`
			window.setTimeout(this.validatePosition.bind(this), 10)
		}
		document.body.appendChild(view)
		
		this.openerView.classList.add("dropdownOpened")
		if(options?.disableMenuPointerEvents)
			view.style.pointerEvents = "none"
		return view
	}
	
	public validatePosition(): void {
		const rect = this.view.getBoundingClientRect()
		if(rect.left < 0) {
			this.view.style.left = "5px"
			this.view.style.right = "unset"
			this.view.style.transform = "none"
		}
		if(rect.right > window.innerWidth) {
			this.view.style.left = "unset"
			this.view.style.right = "5px"
			this.view.style.transform = "none"
		}
		
		if(rect.top < 0) {
			this.view.style.top = "5px"
			this.view.style.bottom = "unset"
		}
		if(rect.bottom > window.innerHeight) {
			this.view.style.top = "unset"
			this.view.style.bottom = "5px"
		}
	}
	
	private clickOutside(e: Event): void {
		const target = e.target as Element
		if(this.view.contains(target))
			return
		if(this.connectedDropdowns) {
			for(const name of this.connectedDropdowns) {
				if(openedMenus[name]?.view.contains(target))
					return
			}
		}
		
		this.close();
		e.stopPropagation();
	}
	
	public close(): boolean {
		m.mount(this.view, null)
		this.openerView.classList.remove("dropdownOpened")
		delete openedMenus[this.id]
		document.removeEventListener("click", this.clickOutsideImpl)
		
		if(this.view.parentElement != null)
			this.view.parentElement.removeChild(this.view)
		return true;
	}
}

function createDropdown(id: string, openerView: Element, options?: DropdownOptions): DropdownMenuImpl | null {
	if(openedMenus.hasOwnProperty(id)) {
		openedMenus[id].close()
		return null
	}
	
	const dropDownMenuImpl = new DropdownMenuImpl(id, openerView, options)
	openedMenus[id] = dropDownMenuImpl
	
	return dropDownMenuImpl
}

export interface DropdownComponentOptions {
	id: string
	clickElement: Vnode<any, unknown>
	menuContent: (close: () => void) => Vnode
	options?: DropdownOptions,
	className?: string //in case the parent has added a className that we need to include
}
class DropdownComponent implements Component<DropdownComponentOptions, unknown> {
	private currentClickListener?: () => void
	
	private setListener(vNode: VnodeDOM<DropdownComponentOptions, unknown>): void {
		const id = vNode.attrs.id
		const clickDom = vNode.attrs.clickElement as VnodeDOM //clickElement should have become a VnodeDOM when this is called
		const options = vNode.attrs.options
		const eventName = options?.eventName ?? "click"
		if(this.currentClickListener)
			clickDom.dom.removeEventListener(eventName, this.currentClickListener)
		this.currentClickListener = () => {
			if(options?.customEvent)
				options.customEvent()
			const impl = openDropdown(id, vNode.dom, vNode.attrs.menuContent, options)
			if(impl && options?.manualPositioning) {
				options.updatePositionCallback = (x: number, y: number) => {
					impl.view.style.top = `${y}px`
					impl.view.style.left = `${x}px`
					impl.view.style.right = "unset"
					impl.view.style.bottom = "unset"
					impl.validatePosition()
				}
			}
		}
		clickDom.dom.addEventListener(eventName, this.currentClickListener)
	}
	
	public oncreate(vNode: VnodeDOM<DropdownComponentOptions, unknown>): void {
		this.setListener(vNode)
	}
	public onupdate(vNode: VnodeDOM<DropdownComponentOptions, unknown>): void {
		this.setListener(vNode) //update in case vNode has changed
	}
	
	
	public view(vNode: Vnode<DropdownComponentOptions, unknown>): Vnode<HTMLElement, unknown> {
		const view = vNode.attrs.clickElement
		view.attrs.className = `${vNode.attrs.className ?? ""} ${view.attrs.className ?? ""}`
		return view
	}
}

export function openDropdown(id: string, openerView: Element, menuContent: (close: () => void) => Vnode, options?: DropdownOptions): DropdownMenuImpl | null {
	const dropDownMenuImpl = createDropdown(id, openerView, options)
	if(dropDownMenuImpl)
		m.mount(dropDownMenuImpl.view, {
			onupdate(): void {
				dropDownMenuImpl.validatePosition()
			},
			view: () => menuContent(() => closeDropdown(id))
		})
	else
		closeDropdown(id)
	return dropDownMenuImpl
}

export function DropdownMenu(
	id: string,
	clickElement: Vnode<any, unknown>,
	menuContent: (close: () => void) => Vnode<any, any>,
	options?: DropdownOptions
): Vnode<DropdownComponentOptions, unknown> {
	return m(DropdownComponent, {
		id: id,
		clickElement: clickElement,
		menuContent: menuContent,
		options: options
	})
}
export function MouseOverDropdownMenu(
	id: string,
	clickElement: Vnode<any, any>,
	menuContent: (close: () => void) => Vnode<any, any>,
	options?: DropdownOptions
): Vnode<DropdownComponentOptions, unknown> {
	clickElement.attrs.onmouseleave = () => {
		closeDropdown(id)
	}
	if(options)
		options.eventName = "mouseenter"
	else
		options = {eventName: "mouseenter"}
	return m(DropdownComponent, {
		id: id,
		clickElement: clickElement,
		menuContent: menuContent,
		options: options
	})
}

export function NativeDropdownMenu(
	id: string,
	clickElement: HTMLElement,
	menuContent: (close: () => void) => HTMLElement,
	options?: DropdownOptions,
): void {
	clickElement.addEventListener(options?.eventName ?? "click" , () => {
		const dropDownMenuImpl = createDropdown(id, clickElement, options)
		if(dropDownMenuImpl)
			dropDownMenuImpl.view.appendChild(menuContent(() => closeDropdown(id)))
	})
}

export function dropdownIsOpened(id: string): boolean {
	return openedMenus.hasOwnProperty(id)
}

export function closeDropdown(id: string): void {
	openedMenus[id]?.close()
}
