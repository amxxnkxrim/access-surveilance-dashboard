import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Database, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { isSupabaseConfigured, supabase } from './lib/supabase'

type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'boolean' | 'json' | 'select'

interface DatabaseField {
  name: string
  label: string
  type?: FieldType
  required?: boolean
  options?: string[]
  defaultValue?: string | number | boolean
}

interface DatabaseTable {
  name: string
  label: string
  summary: string
  columns: string[]
  fields: DatabaseField[]
  canInsert?: boolean
  canDelete?: boolean
  readOnly?: boolean
}

type DatabaseRow = Record<string, unknown>

const tables: DatabaseTable[] = [
  {
    name: 'profiles',
    label: 'Profiles',
    summary: 'Signed-in staff profiles',
    columns: ['full_name', 'email', 'role', 'employment_status'],
    fields: [
      { name: 'full_name', label: 'Full name', required: true },
      { name: 'email', label: 'Email', required: true },
      { name: 'phone', label: 'Phone' },
      { name: 'role', label: 'Role', type: 'select', required: true, options: ['ADMIN', 'OFFICE_ADMIN', 'TECHNICIAN'] },
      { name: 'employment_status', label: 'Employment status', type: 'select', required: true, options: ['active', 'inactive'], defaultValue: 'active' },
    ],
    canInsert: false,
    canDelete: false,
  },
  {
    name: 'customers',
    label: 'Customers',
    summary: 'Customer contact and address records',
    columns: ['customer_id', 'full_name', 'customer_type', 'city', 'phone'],
    fields: [
      { name: 'customer_id', label: 'Customer reference', required: true },
      { name: 'full_name', label: 'Full name / company', required: true },
      { name: 'customer_type', label: 'Customer type', type: 'select', required: true, options: ['Residential', 'Commercial'] },
      { name: 'contact_person', label: 'Contact person' },
      { name: 'phone', label: 'Phone' },
      { name: 'email', label: 'Email' },
      { name: 'address', label: 'Address' },
      { name: 'suburb', label: 'Suburb' },
      { name: 'city', label: 'City' },
      { name: 'province', label: 'Province' },
      { name: 'postal_code', label: 'Postal code' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    name: 'equipment',
    label: 'Equipment',
    summary: 'Installed assets and equipment',
    columns: ['equipment_id', 'model', 'category', 'status', 'quantity'],
    fields: [
      { name: 'equipment_id', label: 'Equipment reference', required: true },
      { name: 'customer_id', label: 'Customer UUID' },
      { name: 'installation_address', label: 'Installation address' },
      { name: 'category', label: 'Category', required: true },
      { name: 'manufacturer', label: 'Manufacturer' },
      { name: 'model', label: 'Model' },
      { name: 'serial_number', label: 'Serial number' },
      { name: 'quantity', label: 'Quantity', type: 'number', required: true, defaultValue: 1 },
      { name: 'installation_date', label: 'Installation date', type: 'date' },
      { name: 'warranty_expiry', label: 'Warranty expiry', type: 'date' },
      { name: 'condition', label: 'Condition', required: true, defaultValue: 'Good' },
      { name: 'status', label: 'Status', required: true, defaultValue: 'Active' },
      { name: 'technician_id', label: 'Technician profile UUID' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
      { name: 'associated_job_id', label: 'Associated job UUID' },
    ],
  },
  {
    name: 'jobs',
    label: 'Jobs',
    summary: 'Service and installation jobs',
    columns: ['job_reference', 'category', 'status', 'priority', 'scheduled_date'],
    fields: [
      { name: 'job_reference', label: 'Job reference', required: true },
      { name: 'customer_id', label: 'Customer UUID' },
      { name: 'category', label: 'Category', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'site_address', label: 'Site address' },
      { name: 'priority', label: 'Priority', type: 'select', required: true, options: ['Low', 'Medium', 'High', 'Urgent'], defaultValue: 'Medium' },
      { name: 'assigned_technician_id', label: 'Assigned technician profile UUID' },
      { name: 'scheduled_date', label: 'Scheduled date', type: 'date' },
      { name: 'scheduled_time', label: 'Scheduled time' },
      { name: 'status', label: 'Status', type: 'select', required: true, options: ['New', 'Awaiting quotation', 'Quotation sent', 'Approved', 'Scheduled', 'In progress', 'Awaiting parts', 'Completed', 'Invoiced', 'Paid / Closed', 'Cancelled'], defaultValue: 'New' },
      { name: 'equipment_list', label: 'Equipment list (JSON array)', type: 'json' },
      { name: 'customer_instructions', label: 'Customer instructions', type: 'textarea' },
      { name: 'internal_notes', label: 'Internal notes', type: 'textarea' },
      { name: 'completion_date', label: 'Completion date', type: 'date' },
    ],
  },
  {
    name: 'job_assignments',
    label: 'Job assignments',
    summary: 'Technicians assigned to jobs',
    columns: ['job_id', 'technician_id', 'assigned_at'],
    fields: [
      { name: 'job_id', label: 'Job UUID', required: true },
      { name: 'technician_id', label: 'Technician profile UUID', required: true },
    ],
  },
  {
    name: 'job_notes',
    label: 'Job notes',
    summary: 'Notes attached to jobs',
    columns: ['job_id', 'author_id', 'note', 'created_at'],
    fields: [
      { name: 'job_id', label: 'Job UUID', required: true },
      { name: 'author_id', label: 'Author profile UUID' },
      { name: 'note', label: 'Note', type: 'textarea', required: true },
    ],
  },
  {
    name: 'quotations',
    label: 'Quotations',
    summary: 'Quotation headers',
    columns: ['quotation_reference', 'customer_id', 'status', 'total', 'expiry_date'],
    fields: [
      { name: 'quotation_reference', label: 'Quotation reference', required: true },
      { name: 'customer_id', label: 'Customer UUID' },
      { name: 'date_issued', label: 'Date issued', type: 'date', required: true, defaultValue: new Date().toISOString().slice(0, 10) },
      { name: 'expiry_date', label: 'Expiry date', type: 'date' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'status', label: 'Status', required: true, defaultValue: 'Draft' },
      { name: 'terms', label: 'Terms', type: 'textarea' },
      { name: 'vat_enabled', label: 'VAT enabled', type: 'boolean', defaultValue: false },
      { name: 'vat_rate', label: 'VAT rate', type: 'number', required: true, defaultValue: 0 },
      { name: 'total', label: 'Total', type: 'number', required: true, defaultValue: 0 },
    ],
  },
  {
    name: 'quotation_items',
    label: 'Quotation items',
    summary: 'Products and services on quotations',
    columns: ['quotation_id', 'product_service', 'quantity', 'unit_price', 'subtotal'],
    fields: [
      { name: 'quotation_id', label: 'Quotation UUID', required: true },
      { name: 'product_service', label: 'Product or service', required: true },
      { name: 'quantity', label: 'Quantity', type: 'number', required: true, defaultValue: 1 },
      { name: 'unit_price', label: 'Unit price', type: 'number', required: true, defaultValue: 0 },
      { name: 'discount', label: 'Discount', type: 'number', required: true, defaultValue: 0 },
      { name: 'subtotal', label: 'Subtotal', type: 'number', required: true, defaultValue: 0 },
    ],
  },
  {
    name: 'maintenance_agreements',
    label: 'Maintenance agreements',
    summary: 'Recurring maintenance contracts',
    columns: ['agreement_reference', 'customer_id', 'service_frequency', 'status', 'next_service_date'],
    fields: [
      { name: 'agreement_reference', label: 'Agreement reference', required: true },
      { name: 'customer_id', label: 'Customer UUID' },
      { name: 'start_date', label: 'Start date', type: 'date' },
      { name: 'end_date', label: 'End date', type: 'date' },
      { name: 'service_frequency', label: 'Service frequency', required: true },
      { name: 'next_service_date', label: 'Next service date', type: 'date' },
      { name: 'maintenance_price', label: 'Maintenance price', type: 'number', required: true, defaultValue: 0 },
      { name: 'covered_equipment', label: 'Covered equipment', type: 'textarea' },
      { name: 'status', label: 'Status', required: true, defaultValue: 'Pending' },
    ],
  },
  {
    name: 'maintenance_visits',
    label: 'Maintenance visits',
    summary: 'Scheduled and completed visits',
    columns: ['agreement_id', 'job_id', 'visit_date', 'status'],
    fields: [
      { name: 'agreement_id', label: 'Agreement UUID' },
      { name: 'job_id', label: 'Job UUID' },
      { name: 'visit_date', label: 'Visit date', type: 'date' },
      { name: 'status', label: 'Status', required: true, defaultValue: 'Scheduled' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    name: 'invoices',
    label: 'Invoices',
    summary: 'Invoice headers and balances',
    columns: ['invoice_reference', 'customer_id', 'total', 'outstanding_balance', 'payment_status'],
    fields: [
      { name: 'invoice_reference', label: 'Invoice reference', required: true },
      { name: 'customer_id', label: 'Customer UUID' },
      { name: 'job_id', label: 'Job UUID' },
      { name: 'quotation_id', label: 'Quotation UUID' },
      { name: 'invoice_date', label: 'Invoice date', type: 'date', required: true, defaultValue: new Date().toISOString().slice(0, 10) },
      { name: 'due_date', label: 'Due date', type: 'date' },
      { name: 'subtotal', label: 'Subtotal', type: 'number', required: true, defaultValue: 0 },
      { name: 'vat', label: 'VAT', type: 'number', required: true, defaultValue: 0 },
      { name: 'total', label: 'Total', type: 'number', required: true, defaultValue: 0 },
      { name: 'amount_paid', label: 'Amount paid', type: 'number', required: true, defaultValue: 0 },
      { name: 'outstanding_balance', label: 'Outstanding balance', type: 'number', required: true, defaultValue: 0 },
      { name: 'payment_status', label: 'Payment status', required: true, defaultValue: 'Draft' },
    ],
  },
  {
    name: 'invoice_items',
    label: 'Invoice items',
    summary: 'Line items attached to invoices',
    columns: ['invoice_id', 'description', 'quantity', 'unit_price', 'subtotal'],
    fields: [
      { name: 'invoice_id', label: 'Invoice UUID', required: true },
      { name: 'description', label: 'Description', required: true },
      { name: 'quantity', label: 'Quantity', type: 'number', required: true, defaultValue: 1 },
      { name: 'unit_price', label: 'Unit price', type: 'number', required: true, defaultValue: 0 },
      { name: 'discount', label: 'Discount', type: 'number', required: true, defaultValue: 0 },
      { name: 'subtotal', label: 'Subtotal', type: 'number', required: true, defaultValue: 0 },
    ],
  },
  {
    name: 'payments',
    label: 'Payments',
    summary: 'Payments recorded against invoices',
    columns: ['invoice_id', 'payment_date', 'amount', 'payment_method', 'reference'],
    fields: [
      { name: 'invoice_id', label: 'Invoice UUID', required: true },
      { name: 'payment_date', label: 'Payment date', type: 'date', required: true, defaultValue: new Date().toISOString().slice(0, 10) },
      { name: 'amount', label: 'Amount', type: 'number', required: true, defaultValue: 0 },
      { name: 'payment_method', label: 'Payment method', type: 'select', required: true, options: ['EFT', 'Cash', 'Card', 'Other'] },
      { name: 'reference', label: 'Reference' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    name: 'staff',
    label: 'Staff',
    summary: 'Staff directory records',
    columns: ['staff_id', 'full_name', 'email', 'role', 'employment_status'],
    fields: [
      { name: 'staff_id', label: 'Staff reference', required: true },
      { name: 'full_name', label: 'Full name', required: true },
      { name: 'phone', label: 'Phone' },
      { name: 'email', label: 'Email', required: true },
      { name: 'role', label: 'Role', required: true },
      { name: 'employment_status', label: 'Employment status', required: true, defaultValue: 'Active' },
      { name: 'date_joined', label: 'Date joined', type: 'date' },
      { name: 'skills', label: 'Skills', type: 'textarea' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    name: 'notifications',
    label: 'Notifications',
    summary: 'User notifications',
    columns: ['user_id', 'title', 'type', 'is_read', 'created_at'],
    fields: [
      { name: 'user_id', label: 'Profile UUID' },
      { name: 'title', label: 'Title', required: true },
      { name: 'message', label: 'Message', required: true, type: 'textarea' },
      { name: 'type', label: 'Type', required: true },
      { name: 'is_read', label: 'Read', type: 'boolean', defaultValue: false },
    ],
  },
  {
    name: 'documents',
    label: 'Documents',
    summary: 'Document metadata and storage paths',
    columns: ['document_name', 'document_type', 'customer_id', 'job_id', 'storage_path'],
    fields: [
      { name: 'customer_id', label: 'Customer UUID' },
      { name: 'job_id', label: 'Job UUID' },
      { name: 'document_name', label: 'Document name', required: true },
      { name: 'document_type', label: 'Document type', required: true },
      { name: 'storage_path', label: 'Storage path', required: true },
      { name: 'uploaded_by', label: 'Uploader profile UUID' },
    ],
  },
  {
    name: 'company_settings',
    label: 'Company settings',
    summary: 'Company profile and document defaults',
    columns: ['company_name', 'phone', 'email', 'vat_registration_status'],
    fields: [
      { name: 'company_name', label: 'Company name', required: true },
      { name: 'company_logo_url', label: 'Company logo URL' },
      { name: 'business_address', label: 'Business address', type: 'textarea' },
      { name: 'phone', label: 'Phone' },
      { name: 'email', label: 'Email' },
      { name: 'website', label: 'Website' },
      { name: 'company_registration', label: 'Company registration' },
      { name: 'vat_registration_status', label: 'VAT registered', type: 'boolean', defaultValue: false },
      { name: 'vat_registration_number', label: 'VAT registration number' },
      { name: 'quotation_terms', label: 'Quotation terms', type: 'textarea' },
      { name: 'invoice_terms', label: 'Invoice terms', type: 'textarea' },
      { name: 'default_quotation_expiry_days', label: 'Default quotation expiry (days)', type: 'number', required: true, defaultValue: 14 },
      { name: 'default_payment_terms', label: 'Default payment terms' },
      { name: 'document_numbering', label: 'Document numbering' },
    ],
  },
  {
    name: 'activity_logs',
    label: 'Activity logs',
    summary: 'Audit history (read-only)',
    columns: ['actor_id', 'entity_type', 'entity_id', 'action', 'created_at'],
    fields: [],
    readOnly: true,
    canInsert: false,
    canDelete: false,
  },
]

const rowString = (value: unknown) => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const defaultValues = (table: DatabaseTable, row?: DatabaseRow) =>
  Object.fromEntries(table.fields.map((field) => {
    const value = row?.[field.name]
    return [field.name, value === undefined ? field.defaultValue ?? (field.type === 'boolean' ? false : '') : rowString(value)]
  }))

export default function SupabaseDataManager({ onDataChanged }: { onDataChanged: () => Promise<boolean> }) {
  const [selectedName, setSelectedName] = useState(tables[0].name)
  const [rows, setRows] = useState<DatabaseRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [editingRow, setEditingRow] = useState<DatabaseRow | null>(null)
  const [values, setValues] = useState<Record<string, string | number | boolean>>({})
  const [isSaving, setIsSaving] = useState(false)

  const table = tables.find((candidate) => candidate.name === selectedName) ?? tables[0]
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return rows
    return rows.filter((row) => table.columns.some((column) => rowString(row[column]).toLowerCase().includes(query)))
  }, [rows, search, table])

  const fetchRows = useCallback(async () => {
    if (!supabase || !isSupabaseConfigured) {
      return { rows: [] as DatabaseRow[], error: 'Supabase is not configured.' }
    }

    try {
      const { data, error: loadError } = await supabase.from(table.name).select('*')
      return {
        rows: (data ?? []) as DatabaseRow[],
        error: loadError ? `Could not load ${table.label}: ${loadError.message}` : '',
      }
    } catch (loadError) {
      return {
        rows: [] as DatabaseRow[],
        error: `Could not load ${table.label}: ${loadError instanceof Error ? loadError.message : 'Unexpected error.'}`,
      }
    }
  }, [table.label, table.name])

  const loadRows = async () => {
    setIsLoading(true)
    setError('')
    const result = await fetchRows()
    setRows(result.rows)
    setError(result.error)
    setIsLoading(false)
  }

  useEffect(() => {
    let active = true
    const load = async () => {
      const result = await fetchRows()
      if (!active) return
      setRows(result.rows)
      setError(result.error)
      setIsLoading(false)
    }
    void load()
    return () => {
      active = false
    }
  }, [fetchRows])

  const openCreate = () => {
    setEditingRow(null)
    setValues(defaultValues(table))
    setFormMode('create')
    setError('')
  }

  const openEdit = (row: DatabaseRow) => {
    setEditingRow(row)
    setValues(defaultValues(table, row))
    setFormMode('edit')
    setError('')
  }

  const closeForm = () => {
    setFormMode(null)
    setEditingRow(null)
    setValues({})
  }

  const convertValues = () => {
    const result: DatabaseRow = {}
    for (const field of table.fields) {
      const value = values[field.name]
      if (field.type === 'boolean') {
        result[field.name] = Boolean(value)
      } else if (field.type === 'number') {
        if (value === '' && !field.required) {
          result[field.name] = null
        } else {
          const number = Number(value)
          if (!Number.isFinite(number)) throw new Error(`${field.label} must be a valid number.`)
          result[field.name] = number
        }
      } else if (field.type === 'json') {
        if (value === '' && !field.required) {
          result[field.name] = null
        } else {
          try {
            result[field.name] = JSON.parse(String(value))
          } catch {
            throw new Error(`${field.label} must contain valid JSON.`)
          }
        }
      } else {
        const text = String(value ?? '').trim()
        if (!text && field.required) throw new Error(`${field.label} is required.`)
        result[field.name] = text || null
      }
    }
    return result
  }

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase || !formMode) return

    setIsSaving(true)
    setError('')
    try {
      const payload = convertValues()
      const { data: savedRow, error: saveError } = formMode === 'create'
        ? await supabase.from(table.name).insert(payload).select('id').maybeSingle()
        : await supabase.from(table.name).update(payload).eq('id', String(editingRow?.id ?? '')).select('id').maybeSingle()
      if (saveError) throw new Error(saveError.message)
      if (!savedRow) throw new Error('No row was saved. Check your access role and table policies.')
      closeForm()
      const refreshed = await onDataChanged()
      await loadRows()
      if (!refreshed) setError('Record was saved, but the other app screens could not be refreshed.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save this record.')
    } finally {
      setIsSaving(false)
    }
  }

  const deleteRow = async (row: DatabaseRow) => {
    if (!supabase || table.readOnly || table.canDelete === false) return
    if (!window.confirm(`Delete this ${table.label.toLowerCase()} record? This cannot be undone.`)) return

    setError('')
    try {
      const { data: deletedRow, error: deleteError } = await supabase.from(table.name).delete().eq('id', String(row.id ?? '')).select('id').maybeSingle()
      if (deleteError) {
        setError(`Could not delete record: ${deleteError.message}`)
        return
      }
      if (!deletedRow) {
        setError('No row was deleted. Check your access role and table policies.')
        return
      }
      const refreshed = await onDataChanged()
      await loadRows()
      if (!refreshed) setError('Record was deleted, but the other app screens could not be refreshed.')
    } catch (deleteError) {
      setError(`Could not delete record: ${deleteError instanceof Error ? deleteError.message : 'Unexpected error.'}`)
    }
  }

  const displayColumns = rows.length > 0
    ? ['id', ...table.columns].filter((column) => column in rows[0])
    : table.columns
  const canInsert = !table.readOnly && table.canInsert !== false
  const canEdit = !table.readOnly
  const canDelete = !table.readOnly && table.canDelete !== false

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">Administration</p>
        <h2 className="text-2xl font-semibold text-slate-900">Supabase data manager</h2>
        <p className="mt-1 text-sm text-slate-600">View and manage the application tables directly. Changes are saved to Supabase and remain subject to its row-level security policies.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center gap-2 px-2 py-2 text-sm font-semibold text-slate-700"><Database size={16} /> App tables</div>
          <nav className="space-y-1">
            {tables.map((item) => (
              <button
                type="button"
                key={item.name}
                onClick={() => {
                  setSearch('')
                  if (item.name === selectedName) {
                    void loadRows()
                  } else {
                    setIsLoading(true)
                    setSelectedName(item.name)
                  }
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${selectedName === item.name ? 'bg-[#EDF3EC] font-medium text-[#163F2F]' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <span>{item.label}</span>
                <span className="text-xs text-slate-400">{item.name === selectedName ? rows.length : ''}</span>
              </button>
            ))}
          </nav>
        </aside>

        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{table.label}</h3>
              <p className="text-sm text-slate-500">{table.summary} · {rows.length} records</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input aria-label="Search rows" placeholder="Search rows" value={search} onChange={(event) => setSearch(event.target.value)} className="input w-48" />
              <button type="button" onClick={() => void loadRows()} disabled={isLoading} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"><RefreshCw size={15} /> Refresh</button>
              {canInsert && <button type="button" onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-[#163F2F] px-3 py-2 text-sm font-medium text-white"><Plus size={15} /> Add record</button>}
            </div>
          </div>

          {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {table.readOnly && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">This table is read-only here to preserve audit history.</p>}

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  {displayColumns.map((column) => <th key={column} className="whitespace-nowrap py-3 pr-4 font-medium">{column.replaceAll('_', ' ')}</th>)}
                  {(canEdit || canDelete) && <th className="py-3 text-right font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={displayColumns.length + 1} className="py-8 text-center text-slate-500">Loading records...</td></tr>}
                {!isLoading && filteredRows.length === 0 && <tr><td colSpan={displayColumns.length + 1} className="py-8 text-center text-slate-500">No records found.</td></tr>}
                {!isLoading && filteredRows.map((row) => (
                  <tr key={String(row.id)} className="border-b border-slate-100 last:border-b-0">
                    {displayColumns.map((column) => (
                      <td key={column} className={`${column === 'id' ? 'max-w-72 break-all' : 'max-w-64 truncate'} py-3 pr-4 text-slate-700`} title={rowString(row[column])}>{rowString(row[column]) || '—'}</td>
                    ))}
                    {(canEdit || canDelete) && (
                      <td className="whitespace-nowrap py-3 text-right">
                        {canEdit && <button type="button" aria-label={`Edit ${table.label} record`} onClick={() => openEdit(row)} className="mr-2 inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700"><Pencil size={13} /> Edit</button>}
                        {canDelete && <button type="button" aria-label={`Delete ${table.label} record`} onClick={() => void deleteRow(row)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700"><Trash2 size={13} /> Delete</button>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {formMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="database-record-title" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h3 id="database-record-title" className="text-xl font-semibold text-slate-900">{formMode === 'create' ? 'Add' : 'Edit'} {table.label.toLowerCase()} record</h3>
                <p className="text-sm text-slate-500">Changes are written directly to Supabase.</p>
              </div>
              <button type="button" disabled={isSaving} aria-label="Close form" onClick={closeForm} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {table.fields.map((field) => (
                  <label key={field.name} className={field.type === 'textarea' || field.type === 'json' ? 'block sm:col-span-2' : 'block'}>
                    <span className="mb-2 block text-sm font-medium text-slate-600">{field.label}{field.required ? ' *' : ''}</span>
                    {field.type === 'boolean' ? (
                      <input type="checkbox" checked={Boolean(values[field.name])} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.checked }))} className="h-4 w-4 rounded border-slate-300" />
                    ) : field.type === 'select' ? (
                      <select required={field.required} value={String(values[field.name] ?? '')} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} className="input w-full">
                        {!field.required && <option value="">Not set</option>}
                        {values[field.name] && !field.options?.includes(String(values[field.name])) && <option value={String(values[field.name])}>{String(values[field.name])}</option>}
                        {field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    ) : field.type === 'textarea' || field.type === 'json' ? (
                      <textarea required={field.required} value={String(values[field.name] ?? '')} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} className="input min-h-24 w-full" />
                    ) : (
                      <input type={field.type ?? 'text'} required={field.required} value={String(values[field.name] ?? '')} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} className="input w-full" />
                    )}
                  </label>
                ))}
              </div>
              {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button type="button" disabled={isSaving} onClick={closeForm} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">Cancel</button>
                <button type="submit" disabled={isSaving} className="rounded-xl bg-[#163F2F] px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{isSaving ? 'Saving...' : 'Save to Supabase'}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
