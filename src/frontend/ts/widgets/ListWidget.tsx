import {PagesHelper} from "./PagesHelper";
import {BtnWidget} from "./BtnWidget";
import {Lang} from "../../../shared/Lang";
import {LoadingSpinner} from "./LoadingSpinner";
import "./ListWidget.css"
import {BasePublicTable} from "../../../shared/BasePublicTable";
import {Class} from "../../../shared/Class";
import {Site} from "../views/Site";
import {ListMessage} from "../../../shared/messages/ListMessage";
import {ListResponseEntry, ListResponseMessage} from "../../../shared/messages/ListResponseMessage";
import {closeDropdown, DropdownMenu} from "./DropdownMenu";
import m, {Component, Vnode, VnodeDOM} from "mithril";
import {EditEntryComponent} from "./EditEntryWidget";
import {ListFilterData} from "../../../shared/ListFilter";
import {DeleteEntryWidget} from "./DeleteEntryWidget";

const PAGE_SIZE = 25;



export class ListWidgetCallback {
	reload: () => Promise<void> = () => Promise.resolve()
	isEmpty: () => boolean = () => true
}

interface ListComponentOptions<EntryT extends BasePublicTable> {
	site: Site
	tableClass: Class<EntryT>
	title: string,
	AddFirstLineView?: () => Vnode,
	AddSubHeader?: () => Vnode,
	getEntryView: (entry: ListResponseEntry<EntryT>) => Vnode<any, unknown> | Vnode<any, unknown>[],
	hideRefresh?: boolean
	deleteOptions?: {onDeleted?: () => void},
	addOptions?: {
		columns: (keyof EntryT)[],
		onAdded?: () => void,
		customInputView?: (key: keyof EntryT, value: EntryT[keyof EntryT], setValue: (value: EntryT[keyof EntryT]) => void) => Vnode<any, any> | undefined,
		getValueError?: (key: keyof EntryT, value: unknown) => string | undefined
	}
	editOptions?: {
		columns: (keyof EntryT)[],
		onChanged?: () => void,
		customInputView?: (key: keyof EntryT, value: EntryT[keyof EntryT], setValue: (value: EntryT[keyof EntryT]) => void) => Vnode<any, any> | undefined,
		getValueError?: (key: keyof EntryT, value: unknown) => string | undefined
	},
	customHeaderOptions?: Vnode<any, unknown>
	pageSize?: number
	order?: (keyof EntryT | string)
	orderType?: "ASC" | "DESC",
	filter?: ListFilterData,
	callback?: ListWidgetCallback
}

class ListComponent<EntryT extends BasePublicTable> implements Component<ListComponentOptions<EntryT>, unknown> {
	private items: ListResponseEntry<EntryT>[] = []
	private pagesHelper: PagesHelper = new PagesHelper(PAGE_SIZE, this.loadPage.bind(this))
	private idColumn?: keyof EntryT
	private isLoading: boolean = false
	private options?: ListComponentOptions<EntryT>
	
	
	private async loadPage(pageNumber: number = this.pagesHelper.getCurrentPage()): Promise<void> {
		const options = this.options!
		this.isLoading = true
		m.redraw()
		
		const pageSize = PAGE_SIZE
		const response = await this.options!.site.socket.sendAndReceive(
			new ListMessage(options.tableClass, pageNumber * pageSize, pageSize, options.filter, options.order ? options.order.toString() : undefined, options.orderType)
		)
		const listMessage = response as ListResponseMessage<EntryT>
		if(!listMessage.success) {
			this.options!.site.errorManager.error(Lang.get("errorList"))
			return
		}
		
		this.items = listMessage.list
		this.pagesHelper.setTotalCount(listMessage.totalCount)
		this.idColumn = listMessage.idColumn as keyof EntryT
		this.isLoading = false
		m.redraw()
	}
	
	private needsReset(oldOptions: ListComponentOptions<EntryT>, newOptions: ListComponentOptions<EntryT>): boolean {
		return oldOptions.tableClass != newOptions.tableClass
			|| oldOptions.order != newOptions.order
			|| oldOptions.orderType != newOptions.orderType
			|| !!oldOptions.filter != !!newOptions.filter
			|| (!!newOptions.filter && !oldOptions.filter?.isSame(newOptions.filter))
	}
	
	private getId(entry: EntryT): number | bigint {
		const idColumn = this.idColumn
		if(!idColumn)
			return -1
		
		return entry[idColumn] as number | bigint
	}
	
	private async addItem(newData: ListResponseEntry<EntryT>) {
		const options = this.options!
		
		this.items.push(newData)
		options.addOptions?.onAdded && options.addOptions?.onAdded()
		closeDropdown(`Add~${options.tableClass.name}`)
		m.redraw()
	}
	
	private async editItem(id: number | bigint, newData: ListResponseEntry<EntryT>) {
		const options = this.options!
		
		const index = this.items.findIndex(entry => this.getId(entry.item) == id)
		this.items[index] = newData
		options.editOptions?.onChanged && options.editOptions?.onChanged()
		closeDropdown(`Edit~${options.tableClass.name}`)
		m.redraw()
	}
	
	private setOptions(vNode: Vnode<ListComponentOptions<EntryT>, unknown>): void {
		this.options = vNode.attrs
		if(this.options.callback) {
			this.options.callback.reload = this.loadPage.bind(this)
			this.options.callback.isEmpty = this.pagesHelper.isEmpty.bind(this.pagesHelper)
		}
	}
	
	public async oncreate(vNode: Vnode<ListComponentOptions<EntryT>, unknown>): Promise<void> {
		this.setOptions(vNode)
		await this.loadPage()
	}
	public onbeforeupdate(newNode: Vnode<ListComponentOptions<EntryT>, unknown>, oldNode: VnodeDOM<ListComponentOptions<EntryT>, unknown>): void {
		this.setOptions(newNode)
		if(this.needsReset(oldNode.attrs, newNode.attrs)) {
			this.pagesHelper.reset()
			this.items = []
			this.loadPage()
		}
	}
	
	view(vNode: Vnode<ListComponentOptions<EntryT>, unknown>): Vnode {
		const options = vNode.attrs
		return <div class="listWidget surface vertical">
			<h3 class="header horizontal hAlignCenter vAlignCenter">
				<b class="fillSpace horizontal hAlignCenter">{options.title}</b>
					{this.isLoading
						? LoadingSpinner(this.isLoading)
						: (options.hideRefresh ? "" : BtnWidget.DefaultBtn("reload", this.loadPage.bind(this, this.pagesHelper.getCurrentPage())))
					}
				{options.addOptions &&
					DropdownMenu(
						`Add~${options.tableClass.name}`,
						BtnWidget.PopoverBtn("add", Lang.get("addEntry")),
						() => m(EditEntryComponent<EntryT>, {
							mode: "add",
							site: options.site,
							tableClass: options.tableClass,
							columns: options.addOptions!.columns,
							onFinish: this.addItem.bind(this),
							customInputView: options.addOptions!.customInputView,
							getValueError: options.addOptions!.getValueError
						})
					)
				}
				{options.customHeaderOptions && options.customHeaderOptions}
			</h3>
			{options.AddSubHeader && options.AddSubHeader()}
			<div class={`${this.isLoading ? "opacity" : ""} content fillSpace subSurface vertical hAlignStretched textCentered`}>
				{this.pagesHelper.isEmpty()
					? Lang.get("noEntries")
					: [
						options.AddFirstLineView && options.AddFirstLineView(), 
						...this.items.map((entry) => {
							const id = this.getId(entry.item)
						
							return <div class="horizontal entry vAlignCenter">
								{options.getEntryView(entry)}
								{options.editOptions &&
									DropdownMenu(
										`Edit~${options.tableClass.name}`,
										BtnWidget.PopoverBtn("edit", Lang.get("changeEntryInfo")),
										() => m(EditEntryComponent<EntryT>, {
											mode: "edit",
											site: options.site,
											editId: id,
											tableClass: options.tableClass,
											columns: options.editOptions!.columns,
											onFinish: this.editItem.bind(this, id),
											customInputView: options.editOptions!.customInputView,
											getValueError: options.editOptions!.getValueError,
											defaults: entry.item
										})
									)
								
								}
								{options.deleteOptions && 
									DeleteEntryWidget({
										site: options.site,
										entryId: this.getId(entry.item),
										tableClass: options.tableClass,
										onDeleted: () => {
											this.items = this.items.filter((r) => this.getId(r.item) != id)
											this.options?.deleteOptions?.onDeleted && this.options?.deleteOptions?.onDeleted()
											m.redraw()
										}
									})
								}
							</div>
						})
					]
				}
			</div>
			{this.pagesHelper.isNeeded() && this.pagesHelper.getView()}
		</div>
	}
}


export function ListWidget<EntryT extends BasePublicTable>(options: ListComponentOptions<EntryT>): Vnode<ListComponentOptions<EntryT>, unknown> {
	return m(ListComponent<EntryT>, options)
}
