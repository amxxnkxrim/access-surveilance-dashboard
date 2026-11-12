import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Bell, Building2, CalendarDays, CheckCircle2, CircleDollarSign, ClipboardList, CreditCard, Database, FileText, Gauge, LayoutDashboard, LogOut, Menu, Plus, Search, Settings, ShieldCheck, UserCog, Users, Wrench, X } from 'lucide-react'
import { format } from 'date-fns'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import jsPDF from 'jspdf'
import { getSupabaseProfileFromEmail, isSupabaseConfigured, supabase } from './lib/supabase'
import SupabaseDataManager from './SupabaseDataManager'

const STORAGE_KEY = 'access-surveillance-state-v1'
const SESSION_KEY = 'access-surveillance-session-v1'
const REMEMBERED_EMAIL_KEY = 'access-surveillance-remembered-email-v1'

type Role = 'ADMIN' | 'OFFICE_ADMIN' | 'TECHNICIAN'
type CustomerType = 'Residential' | 'Commercial'
type JobStatus =
  | 'New'
  | 'Awaiting quotation'
  | 'Quotation sent'
  | 'Approved'
  | 'Scheduled'
  | 'In progress'
  | 'Awaiting parts'
  | 'Completed'
  | 'Invoiced'
  | 'Paid / Closed'
  | 'Cancelled'

type NotificationType = 'job' | 'quotation' | 'invoice' | 'maintenance' | 'system'

interface UserProfile {
  id: string
  name: string
  email: string
  role: Role
  phone: string
  status: 'active' | 'inactive'
}

interface Customer {
  id: string
  customerId: string
  fullName: string
  type: CustomerType
  contactPerson: string
  phone: string
  email: string
  address: string
  suburb: string
  city: string
  province: string
  postalCode: string
  notes: string
  dateAdded: string
}

interface Equipment {
  id: string
  equipmentId: string
  customerId: string
  installationAddress: string
  category: string
  manufacturer: string
  model: string
  serialNumber: string
  quantity: number
  installationDate: string
  warrantyExpiry: string
  condition: string
  status: string
  technician: string
  notes: string
}

interface Job {
  id: string
  jobReference: string
  customer: string
  category: string
  description: string
  siteAddress: string
  priority: 'Low' | 'Medium' | 'High' | 'Urgent'
  assignedTechnician: string
  scheduledDate: string
  scheduledTime: string
  status: JobStatus
  equipment: string
  customerInstructions: string
  internalNotes: string
  completionDate: string
}

interface QuotationItem {
  id: string
  productService: string
  quantity: number
  unitPrice: number
  discount: number
  subtotal: number
}

interface Quotation {
  id: string
  quotationReference: string
  customer: string
  dateIssued: string
  expiryDate: string
  description: string
  status: 'Draft' | 'Sent' | 'Awaiting approval' | 'Approved' | 'Rejected' | 'Expired'
  terms: string
  items: QuotationItem[]
  total: number
}

interface MaintenanceAgreement {
  id: string
  agreementReference: string
  customer: string
  startDate: string
  endDate: string
  serviceFrequency: string
  nextServiceDate: string
  maintenancePrice: number
  coveredEquipment: string
  status: 'Active' | 'Pending' | 'Expired' | 'Cancelled'
}

interface Invoice {
  id: string
  invoiceReference: string
  customer: string
  jobReference: string
  relatedQuotation: string
  invoiceDate: string
  dueDate: string
  subtotal: number
  vat: number
  total: number
  amountPaid: number
  outstandingBalance: number
  status: 'Draft' | 'Sent' | 'Partially paid' | 'Paid' | 'Overdue' | 'Cancelled'
}

interface StaffMember {
  id: string
  staffId: string
  fullName: string
  phone: string
  email: string
  role: Role
  employmentStatus: 'Active' | 'On leave' | 'Terminated'
  dateJoined: string
  skills: string
  notes: string
}

interface NotificationItem {
  id: string
  title: string
  message: string
  type: NotificationType
  read: boolean
  createdAt: string
}

interface CompanySettings {
  companyName: string
  companyLogo: string
  businessAddress: string
  phone: string
  email: string
  website: string
  companyRegistration: string
  vatRegistrationStatus: boolean
  vatRegistrationNumber: string
  quotationTerms: string
  invoiceTerms: string
  defaultQuotationExpiry: number
  defaultPaymentTerms: string
  documentNumbering: string
}

interface AppState {
  users: UserProfile[]
  customers: Customer[]
  equipment: Equipment[]
  jobs: Job[]
  quotations: Quotation[]
  maintenance: MaintenanceAgreement[]
  invoices: Invoice[]
  staff: StaffMember[]
  notifications: NotificationItem[]
  companySettings: CompanySettings
}

interface QuickFormField {
  name: string
  label: string
  type?: 'text' | 'email' | 'date' | 'number' | 'select' | 'textarea'
  required?: boolean
  min?: string
  step?: string
  options?: { value: string; label: string }[]
}

const roles: Role[] = ['ADMIN', 'OFFICE_ADMIN', 'TECHNICIAN']

const customerEditFields: QuickFormField[] = [
  { name: 'customer_id', label: 'Customer reference' },
  { name: 'full_name', label: 'Full name / company' },
  { name: 'customer_type', label: 'Customer type', type: 'select', options: ['Residential', 'Commercial'].map((value) => ({ value, label: value })) },
  { name: 'contact_person', label: 'Contact person', required: false },
  { name: 'phone', label: 'Phone', required: false },
  { name: 'email', label: 'Email', type: 'email', required: false },
  { name: 'address', label: 'Address', required: false },
  { name: 'suburb', label: 'Suburb', required: false },
  { name: 'city', label: 'City', required: false },
  { name: 'province', label: 'Province', required: false },
  { name: 'postal_code', label: 'Postal code', required: false },
  { name: 'notes', label: 'Notes', type: 'textarea', required: false },
]
const equipmentEditFields: QuickFormField[] = [
  { name: 'equipment_id', label: 'Equipment reference' },
  { name: 'customer_id', label: 'Customer UUID', required: false },
  { name: 'installation_address', label: 'Installation address', required: false },
  { name: 'category', label: 'Category' },
  { name: 'manufacturer', label: 'Manufacturer', required: false },
  { name: 'model', label: 'Model' },
  { name: 'serial_number', label: 'Serial number', required: false },
  { name: 'quantity', label: 'Quantity', type: 'number', min: '1', step: '1' },
  { name: 'installation_date', label: 'Installation date', type: 'date', required: false },
  { name: 'warranty_expiry', label: 'Warranty expiry', type: 'date', required: false },
  { name: 'condition', label: 'Condition' },
  { name: 'status', label: 'Status' },
  { name: 'technician_id', label: 'Technician profile UUID', required: false },
  { name: 'notes', label: 'Notes', type: 'textarea', required: false },
  { name: 'associated_job_id', label: 'Associated job UUID', required: false },
]
const jobEditFields: QuickFormField[] = [
  { name: 'customer_id', label: 'Customer UUID', required: false },
  { name: 'category', label: 'Category' },
  { name: 'description', label: 'Description', type: 'textarea', required: false },
  { name: 'site_address', label: 'Site address', required: false },
  { name: 'priority', label: 'Priority', type: 'select', options: ['Low', 'Medium', 'High', 'Urgent'].map((value) => ({ value, label: value })) },
  { name: 'assigned_technician_id', label: 'Technician profile UUID', required: false },
  { name: 'scheduled_date', label: 'Scheduled date', type: 'date', required: false },
  { name: 'scheduled_time', label: 'Scheduled time', required: false },
  { name: 'status', label: 'Status', type: 'select', options: ['New', 'Awaiting quotation', 'Quotation sent', 'Approved', 'Scheduled', 'In progress', 'Awaiting parts', 'Completed', 'Invoiced', 'Paid / Closed', 'Cancelled'].map((value) => ({ value, label: value })) },
  { name: 'equipment_list', label: 'Equipment (comma separated)', required: false },
  { name: 'customer_instructions', label: 'Customer instructions', type: 'textarea', required: false },
  { name: 'internal_notes', label: 'Internal notes', type: 'textarea', required: false },
  { name: 'completion_date', label: 'Completion date', type: 'date', required: false },
]
const quotationEditFields: QuickFormField[] = [
  { name: 'customer_id', label: 'Customer UUID', required: false },
  { name: 'date_issued', label: 'Date issued', type: 'date' },
  { name: 'expiry_date', label: 'Expiry date', type: 'date', required: false },
  { name: 'description', label: 'Description', type: 'textarea', required: false },
  { name: 'status', label: 'Status', type: 'select', options: ['Draft', 'Sent', 'Awaiting approval', 'Approved', 'Rejected', 'Expired'].map((value) => ({ value, label: value })) },
  { name: 'terms', label: 'Terms', type: 'textarea', required: false },
  { name: 'total', label: 'Total', type: 'number', min: '0', step: '0.01' },
]
const maintenanceEditFields: QuickFormField[] = [
  { name: 'customer_id', label: 'Customer UUID', required: false },
  { name: 'start_date', label: 'Start date', type: 'date', required: false },
  { name: 'end_date', label: 'End date', type: 'date', required: false },
  { name: 'service_frequency', label: 'Service frequency' },
  { name: 'next_service_date', label: 'Next service date', type: 'date', required: false },
  { name: 'maintenance_price', label: 'Maintenance price', type: 'number', min: '0', step: '0.01' },
  { name: 'covered_equipment', label: 'Covered equipment', type: 'textarea', required: false },
  { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Pending', 'Expired', 'Cancelled'].map((value) => ({ value, label: value })) },
]
const invoiceEditFields: QuickFormField[] = [
  { name: 'customer_id', label: 'Customer UUID', required: false },
  { name: 'job_id', label: 'Job UUID', required: false },
  { name: 'quotation_id', label: 'Quotation UUID', required: false },
  { name: 'invoice_date', label: 'Invoice date', type: 'date' },
  { name: 'due_date', label: 'Due date', type: 'date', required: false },
  { name: 'subtotal', label: 'Subtotal', type: 'number', min: '0', step: '0.01' },
  { name: 'vat', label: 'VAT', type: 'number', min: '0', step: '0.01' },
  { name: 'total', label: 'Total', type: 'number', min: '0', step: '0.01' },
  { name: 'amount_paid', label: 'Amount paid', type: 'number', min: '0', step: '0.01' },
  { name: 'outstanding_balance', label: 'Outstanding balance', type: 'number', min: '0', step: '0.01' },
  { name: 'payment_status', label: 'Payment status', type: 'select', options: ['Draft', 'Sent', 'Partially paid', 'Paid', 'Overdue', 'Cancelled'].map((value) => ({ value, label: value })) },
]
const staffEditFields: QuickFormField[] = [
  { name: 'staff_id', label: 'Staff reference' },
  { name: 'full_name', label: 'Full name' },
  { name: 'phone', label: 'Phone', required: false },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'role', label: 'Role', type: 'select', options: roles.map((value) => ({ value, label: value })) },
  { name: 'employment_status', label: 'Employment status', type: 'select', options: ['Active', 'On leave', 'Terminated'].map((value) => ({ value, label: value })) },
  { name: 'date_joined', label: 'Date joined', type: 'date', required: false },
  { name: 'skills', label: 'Skills', type: 'textarea', required: false },
  { name: 'notes', label: 'Notes', type: 'textarea', required: false },
]

const navItems = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, roles },
  { label: 'Customers', to: '/customers', icon: Users, roles: ['ADMIN', 'OFFICE_ADMIN'] },
  { label: 'Equipment', to: '/equipment', icon: Wrench, roles },
  { label: 'Jobs', to: '/jobs', icon: ClipboardList, roles },
  { label: 'Quotations', to: '/quotations', icon: FileText, roles: ['ADMIN', 'OFFICE_ADMIN'] },
  { label: 'Maintenance', to: '/maintenance', icon: CalendarDays, roles },
  { label: 'Invoices', to: '/invoices', icon: CreditCard, roles: ['ADMIN', 'OFFICE_ADMIN'] },
  { label: 'Staff', to: '/staff', icon: UserCog, roles: ['ADMIN'] },
  { label: 'Reports', to: '/reports', icon: Gauge, roles: ['ADMIN', 'OFFICE_ADMIN'] },
  { label: 'Settings', to: '/settings', icon: Settings, roles: ['ADMIN'] },
  { label: 'Data manager', to: '/data', icon: Database, roles: ['ADMIN'] },
]

const seedState: AppState = {
  users: [
    { id: 'u-1', name: 'Nandi Mokoena', email: 'admin@accesssurveillance.co.za', role: 'ADMIN', phone: '+27 31 555 0101', status: 'active' },
    { id: 'u-2', name: 'Lerato Ndlovu', email: 'office@accesssurveillance.co.za', role: 'OFFICE_ADMIN', phone: '+27 31 555 0102', status: 'active' },
    { id: 'u-3', name: 'Sibusiso Khumalo', email: 'tech@accesssurveillance.co.za', role: 'TECHNICIAN', phone: '+27 83 555 0199', status: 'active' },
  ],
  customers: [
    { id: 'c-1', customerId: 'AS-CUS-2026-001', fullName: 'Oakridge Apartments', type: 'Commercial', contactPerson: 'Megan Smith', phone: '+27 31 555 1001', email: 'manager@oakridge.co.za', address: '18 Wilger Road', suburb: 'Morningside', city: 'Durban', province: 'KwaZulu-Natal', postalCode: '4001', notes: 'Requires quarterly maintenance review.', dateAdded: '2026-01-11' },
    { id: 'c-2', customerId: 'AS-CUS-2026-002', fullName: 'Aiden van Dyk', type: 'Residential', contactPerson: 'Aiden van Dyk', phone: '+27 82 555 2002', email: 'aiden@gmail.com', address: '42 Sunset Avenue', suburb: 'Berea', city: 'Durban', province: 'KwaZulu-Natal', postalCode: '4007', notes: 'Installing smart monitoring solution.', dateAdded: '2026-02-15' },
    { id: 'c-3', customerId: 'AS-CUS-2026-003', fullName: 'North Beach Retail Park', type: 'Commercial', contactPerson: 'Riaan Peters', phone: '+27 31 555 3003', email: 'ops@northbeachretail.co.za', address: '71 Marine Parade', suburb: 'North Beach', city: 'Durban', province: 'KwaZulu-Natal', postalCode: '4056', notes: 'Multi-site coverage with access control.', dateAdded: '2026-03-06' },
  ],
  equipment: [
    { id: 'e-1', equipmentId: 'AS-EQ-2026-001', customerId: 'c-1', installationAddress: '18 Wilger Road', category: 'CCTV cameras', manufacturer: 'Hikvision', model: 'DS-2CD2387G2-LU', serialNumber: 'HIK-001234', quantity: 8, installationDate: '2026-01-12', warrantyExpiry: '2028-01-12', condition: 'Good', status: 'Active', technician: 'Sibusiso Khumalo', notes: 'Main entrance and loading bay monitoring.' },
    { id: 'e-2', equipmentId: 'AS-EQ-2026-002', customerId: 'c-2', installationAddress: '42 Sunset Avenue', category: 'Ajax alarm systems', manufacturer: 'Ajax', model: 'Hub 2', serialNumber: 'AJX-77821', quantity: 1, installationDate: '2026-02-20', warrantyExpiry: '2027-02-20', condition: 'Good', status: 'Active', technician: 'Sibusiso Khumalo', notes: 'Motion and door sensors installed.' },
    { id: 'e-3', equipmentId: 'AS-EQ-2026-003', customerId: 'c-3', installationAddress: '71 Marine Parade', category: 'Network switches', manufacturer: 'Ubiquiti', model: 'USW-Enterprise-48P', serialNumber: 'UBI-93441', quantity: 2, installationDate: '2026-03-11', warrantyExpiry: '2029-03-11', condition: 'Excellent', status: 'Active', technician: 'Sibusiso Khumalo', notes: 'PoE switch for camera backbone.' },
  ],
  jobs: [
    { id: 'j-1', jobReference: 'AS-J-2026-001', customer: 'Oakridge Apartments', category: 'New installation', description: 'Install CCTV and access control for the main gate and lobby.', siteAddress: '18 Wilger Road, Morningside', priority: 'High', assignedTechnician: 'Sibusiso Khumalo', scheduledDate: '2026-11-14', scheduledTime: '08:00', status: 'Scheduled', equipment: 'CCTV cameras, Access control systems', customerInstructions: 'Do not disturb tenants between 08:00 and 10:00.', internalNotes: 'Check backup power and NVR redundancy.', completionDate: '' },
    { id: 'j-2', jobReference: 'AS-J-2026-002', customer: 'Aiden van Dyk', category: 'Maintenance', description: 'Quarterly alarm check and sensor servicing.', siteAddress: '42 Sunset Avenue, Berea', priority: 'Medium', assignedTechnician: 'Sibusiso Khumalo', scheduledDate: '2026-11-16', scheduledTime: '11:00', status: 'In progress', equipment: 'Ajax alarm systems', customerInstructions: 'Please keep gate open during testing.', internalNotes: 'Inspect battery reserve level.', completionDate: '' },
    { id: 'j-3', jobReference: 'AS-J-2026-003', customer: 'North Beach Retail Park', category: 'Repair', description: 'Fault-finding for motion alert camera at loading bays.', siteAddress: '71 Marine Parade, North Beach', priority: 'Urgent', assignedTechnician: 'Sibusiso Khumalo', scheduledDate: '2026-11-12', scheduledTime: '14:00', status: 'Awaiting parts', equipment: 'CCTV cameras, Network switches', customerInstructions: 'Priority after 13:00 due to peak trade hours.', internalNotes: 'Awaiting replacement PoE injector.', completionDate: '' },
  ],
  quotations: [
    { id: 'q-1', quotationReference: 'AS-Q-2026-001', customer: 'Oakridge Apartments', dateIssued: '2026-11-02', expiryDate: '2026-11-16', description: 'CCTV and access control upgrade quote', status: 'Approved', terms: 'Payment due within 14 days of approval.', items: [
      { id: 'qi-1', productService: 'Camera installation labour', quantity: 1, unitPrice: 8400, discount: 0, subtotal: 8400 },
      { id: 'qi-2', productService: 'Access control hardware', quantity: 1, unitPrice: 12600, discount: 500, subtotal: 12100 },
    ], total: 20500 },
    { id: 'q-2', quotationReference: 'AS-Q-2026-002', customer: 'North Beach Retail Park', dateIssued: '2026-11-03', expiryDate: '2026-11-17', description: 'Retail park maintenance and diagnostic visit', status: 'Awaiting approval', terms: 'Service is valid for 14 days.', items: [
      { id: 'qi-3', productService: 'Site inspection', quantity: 1, unitPrice: 2400, discount: 0, subtotal: 2400 },
      { id: 'qi-4', productService: 'Camera replacement and testing', quantity: 2, unitPrice: 4100, discount: 200, subtotal: 8000 },
    ], total: 10400 },
  ],
  maintenance: [
    { id: 'm-1', agreementReference: 'AS-MA-2026-001', customer: 'Oakridge Apartments', startDate: '2026-01-12', endDate: '2026-12-12', serviceFrequency: 'Every 3 months', nextServiceDate: '2026-11-18', maintenancePrice: 2500, coveredEquipment: 'CCTV camera network', status: 'Active' },
    { id: 'm-2', agreementReference: 'AS-MA-2026-002', customer: 'Aiden van Dyk', startDate: '2026-02-10', endDate: '2027-02-10', serviceFrequency: 'Monthly', nextServiceDate: '2026-11-15', maintenancePrice: 1200, coveredEquipment: 'Alarm system', status: 'Active' },
  ],
  invoices: [
    { id: 'i-1', invoiceReference: 'AS-INV-2026-001', customer: 'Oakridge Apartments', jobReference: 'AS-J-2026-001', relatedQuotation: 'AS-Q-2026-001', invoiceDate: '2026-11-04', dueDate: '2026-11-18', subtotal: 20500, vat: 3075, total: 23575, amountPaid: 15000, outstandingBalance: 8575, status: 'Partially paid' },
    { id: 'i-2', invoiceReference: 'AS-INV-2026-002', customer: 'Aiden van Dyk', jobReference: 'AS-J-2026-002', relatedQuotation: 'AS-Q-2026-002', invoiceDate: '2026-11-07', dueDate: '2026-11-21', subtotal: 9800, vat: 0, total: 9800, amountPaid: 0, outstandingBalance: 9800, status: 'Overdue' },
  ],
  staff: [
    { id: 's-1', staffId: 'AS-ST-001', fullName: 'Sibusiso Khumalo', phone: '+27 83 555 0199', email: 'tech@accesssurveillance.co.za', role: 'TECHNICIAN', employmentStatus: 'Active', dateJoined: '2025-03-12', skills: 'CCTV, access control, maintenance', notes: 'Lead field technician.' },
    { id: 's-2', staffId: 'AS-ST-002', fullName: 'Lerato Ndlovu', phone: '+27 71 555 4401', email: 'office@accesssurveillance.co.za', role: 'OFFICE_ADMIN', employmentStatus: 'Active', dateJoined: '2024-08-01', skills: 'Customer support, invoicing, scheduling', notes: 'Handles quotations and scheduling.' },
  ],
  notifications: [
    { id: 'n-1', title: 'Job scheduled', message: 'AS-J-2026-001 has been assigned to Sibusiso Khumalo for 14 Nov 08:00.', type: 'job', read: false, createdAt: '2026-11-10T09:00:00Z' },
    { id: 'n-2', title: 'Quotation approval', message: 'Oakridge Apartments has approved the CCTV upgrade quote.', type: 'quotation', read: false, createdAt: '2026-11-08T14:30:00Z' },
    { id: 'n-3', title: 'Maintenance due', message: 'Oakridge Apartments maintenance visit is due in 3 days.', type: 'maintenance', read: true, createdAt: '2026-11-05T11:15:00Z' },
  ],
  companySettings: {
    companyName: 'Access Surveillance',
    companyLogo: '',
    businessAddress: '12 Umhlanga Road, Durban, South Africa',
    phone: '+27 31 555 0144',
    email: 'admin@accesssurveillance.co.za',
    website: 'https://accesssurveillance.co.za',
    companyRegistration: '2024/123456/07',
    vatRegistrationStatus: true,
    vatRegistrationNumber: 'VAT 456789012',
    quotationTerms: 'Payment due within 14 days of approval. Installation work is subject to site conditions.',
    invoiceTerms: 'Payment due within 30 days of invoice date. Interest may be charged on overdue balances.',
    defaultQuotationExpiry: 14,
    defaultPaymentTerms: 'Net 30',
    documentNumbering: 'AS-INV-2026',
  },
}

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  password: z.string().min(6, 'Password must be at least 6 characters long.'),
})

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(value)

const getStatusClass = (status: string) => {
  const base = 'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium'
  if (status === 'Completed' || status === 'Approved' || status === 'Paid / Closed' || status === 'Active') {
    return `${base} border-emerald-500/30 bg-emerald-500/10 text-emerald-600`
  }
  if (status === 'Cancelled' || status === 'Rejected' || status === 'Expired') {
    return `${base} border-red-500/30 bg-red-500/10 text-red-600`
  }
  if (status === 'In progress' || status === 'Awaiting quotation' || status === 'Awaiting parts' || status === 'Partially paid' || status === 'Overdue') {
    return `${base} border-amber-500/30 bg-amber-500/10 text-amber-600`
  }
  return `${base} border-blue-500/30 bg-blue-500/10 text-blue-600`
}

const loadState = (): AppState => {
  if (typeof window === 'undefined') return seedState
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (!stored) return seedState

  try {
    return JSON.parse(stored) as AppState
  } catch {
    return seedState
  }
}

const loadSession = () => {
  if (typeof window === 'undefined') return null
  const stored = window.localStorage.getItem(SESSION_KEY)
  if (!stored) return null

  try {
    return JSON.parse(stored) as UserProfile | null
  } catch {
    return null
  }
}

const loadRememberedEmail = () => {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? ''
}

const normalizeRole = (role: string | undefined): Role => {
  if (role === 'ADMIN' || role === 'OFFICE_ADMIN' || role === 'TECHNICIAN') {
    return role
  }

  return 'TECHNICIAN'
}

const normalizeSupabaseProfile = (profile: any): UserProfile => ({
  id: profile?.id ?? profile?.user_id ?? 'auth-user',
  name: profile?.full_name ?? profile?.name ?? 'Access User',
  email: profile?.email ?? '',
  role: normalizeRole(profile?.role),
  phone: profile?.phone ?? '',
  status: profile?.employment_status === 'inactive' ? 'inactive' : 'active',
})

type SupabaseRow = Record<string, unknown>

const asSupabaseRows = (value: unknown): SupabaseRow[] =>
  Array.isArray(value)
    ? value.filter((row): row is SupabaseRow => typeof row === 'object' && row !== null)
    : []

const stringField = (row: SupabaseRow, field: string, fallback = '') => {
  const value = row[field]
  return typeof value === 'string' ? value : value === null || value === undefined ? fallback : String(value)
}

const numberField = (row: SupabaseRow, field: string, fallback = 0) => {
  const value = row[field]
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

const dateField = (row: SupabaseRow, field: string) => stringField(row, field).slice(0, 10)

const createReference = (prefix: string) =>
  `${prefix}-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`

const mapCustomerRecord = (record: SupabaseRow): Customer => ({
  id: stringField(record, 'id'),
  customerId: stringField(record, 'customer_id'),
  fullName: stringField(record, 'full_name'),
  type: stringField(record, 'customer_type') === 'Commercial' ? 'Commercial' : 'Residential',
  contactPerson: stringField(record, 'contact_person'),
  phone: stringField(record, 'phone'),
  email: stringField(record, 'email'),
  address: stringField(record, 'address'),
  suburb: stringField(record, 'suburb'),
  city: stringField(record, 'city'),
  province: stringField(record, 'province'),
  postalCode: stringField(record, 'postal_code'),
  notes: stringField(record, 'notes'),
  dateAdded: dateField(record, 'date_added') || dateField(record, 'created_at'),
})

const mapJobStatus = (value: string): JobStatus => {
  const statuses: JobStatus[] = ['New', 'Awaiting quotation', 'Quotation sent', 'Approved', 'Scheduled', 'In progress', 'Awaiting parts', 'Completed', 'Invoiced', 'Paid / Closed', 'Cancelled']
  return statuses.find((status) => status === value) ?? 'New'
}

const mapSupabaseAppState = (tables: Record<string, unknown>): AppState => {
  const rows = (table: string) => asSupabaseRows(tables[table])
  const profiles = rows('profiles')
  const customers = rows('customers').map(mapCustomerRecord)
  const customerById = new Map(rows('customers').map((row, index) => [stringField(row, 'id'), customers[index]]))
  const profileById = new Map(profiles.map((row) => [stringField(row, 'id'), row]))
  const quotationItemsById = new Map<string, QuotationItem[]>()

  rows('quotation_items').forEach((row) => {
    const quotationId = stringField(row, 'quotation_id')
    const items = quotationItemsById.get(quotationId) ?? []
    items.push({
      id: stringField(row, 'id'),
      productService: stringField(row, 'product_service'),
      quantity: numberField(row, 'quantity', 1),
      unitPrice: numberField(row, 'unit_price'),
      discount: numberField(row, 'discount'),
      subtotal: numberField(row, 'subtotal'),
    })
    quotationItemsById.set(quotationId, items)
  })

  const jobs = rows('jobs').map((row): Job => {
    const equipmentList = row.equipment_list
    const equipment = Array.isArray(equipmentList)
      ? equipmentList.map((item) => String(item)).join(', ')
      : typeof equipmentList === 'string' ? equipmentList : ''
    const technician = profileById.get(stringField(row, 'assigned_technician_id'))

    return {
      id: stringField(row, 'id'),
      jobReference: stringField(row, 'job_reference'),
      customer: customerById.get(stringField(row, 'customer_id'))?.fullName ?? '',
      category: stringField(row, 'category'),
      description: stringField(row, 'description'),
      siteAddress: stringField(row, 'site_address'),
      priority: ['Low', 'Medium', 'High', 'Urgent'].find((priority) => priority === stringField(row, 'priority')) as Job['priority'] ?? 'Medium',
      assignedTechnician: technician ? stringField(technician, 'full_name') : '',
      scheduledDate: dateField(row, 'scheduled_date'),
      scheduledTime: stringField(row, 'scheduled_time'),
      status: mapJobStatus(stringField(row, 'status')),
      equipment,
      customerInstructions: stringField(row, 'customer_instructions'),
      internalNotes: stringField(row, 'internal_notes'),
      completionDate: dateField(row, 'completion_date'),
    }
  })
  const jobById = new Map(rows('jobs').map((row, index) => [stringField(row, 'id'), jobs[index]]))
  const quotationById = new Map(rows('quotations').map((row) => [stringField(row, 'id'), row]))

  const quotations = rows('quotations').map((row): Quotation => ({
    id: stringField(row, 'id'),
    quotationReference: stringField(row, 'quotation_reference'),
    customer: customerById.get(stringField(row, 'customer_id'))?.fullName ?? '',
    dateIssued: dateField(row, 'date_issued'),
    expiryDate: dateField(row, 'expiry_date'),
    description: stringField(row, 'description'),
    status: ['Draft', 'Sent', 'Awaiting approval', 'Approved', 'Rejected', 'Expired'].find((status) => status === stringField(row, 'status')) as Quotation['status'] ?? 'Draft',
    terms: stringField(row, 'terms'),
    items: quotationItemsById.get(stringField(row, 'id')) ?? [],
    total: numberField(row, 'total'),
  }))

  const maintenance = rows('maintenance_agreements').map((row): MaintenanceAgreement => ({
    id: stringField(row, 'id'),
    agreementReference: stringField(row, 'agreement_reference'),
    customer: customerById.get(stringField(row, 'customer_id'))?.fullName ?? '',
    startDate: dateField(row, 'start_date'),
    endDate: dateField(row, 'end_date'),
    serviceFrequency: stringField(row, 'service_frequency'),
    nextServiceDate: dateField(row, 'next_service_date'),
    maintenancePrice: numberField(row, 'maintenance_price'),
    coveredEquipment: stringField(row, 'covered_equipment'),
    status: ['Active', 'Pending', 'Expired', 'Cancelled'].find((status) => status === stringField(row, 'status')) as MaintenanceAgreement['status'] ?? 'Pending',
  }))

  const invoices = rows('invoices').map((row): Invoice => {
    const job = jobById.get(stringField(row, 'job_id'))
    const quotation = quotationById.get(stringField(row, 'quotation_id'))
    return {
      id: stringField(row, 'id'),
      invoiceReference: stringField(row, 'invoice_reference'),
      customer: customerById.get(stringField(row, 'customer_id'))?.fullName ?? '',
      jobReference: job?.jobReference ?? '',
      relatedQuotation: quotation ? stringField(quotation, 'quotation_reference') : '',
      invoiceDate: dateField(row, 'invoice_date'),
      dueDate: dateField(row, 'due_date'),
      subtotal: numberField(row, 'subtotal'),
      vat: numberField(row, 'vat'),
      total: numberField(row, 'total'),
      amountPaid: numberField(row, 'amount_paid'),
      outstandingBalance: numberField(row, 'outstanding_balance'),
      status: ['Draft', 'Sent', 'Partially paid', 'Paid', 'Overdue', 'Cancelled'].find((status) => status === stringField(row, 'payment_status')) as Invoice['status'] ?? 'Draft',
    }
  })

  const settings = rows('company_settings')[0]
  const companySettings = settings ? {
    companyName: stringField(settings, 'company_name', seedState.companySettings.companyName),
    companyLogo: stringField(settings, 'company_logo_url'),
    businessAddress: stringField(settings, 'business_address'),
    phone: stringField(settings, 'phone'),
    email: stringField(settings, 'email'),
    website: stringField(settings, 'website'),
    companyRegistration: stringField(settings, 'company_registration'),
    vatRegistrationStatus: settings.vat_registration_status === true,
    vatRegistrationNumber: stringField(settings, 'vat_registration_number'),
    quotationTerms: stringField(settings, 'quotation_terms'),
    invoiceTerms: stringField(settings, 'invoice_terms'),
    defaultQuotationExpiry: numberField(settings, 'default_quotation_expiry_days', 14),
    defaultPaymentTerms: stringField(settings, 'default_payment_terms'),
    documentNumbering: stringField(settings, 'document_numbering'),
  } : seedState.companySettings

  return {
    users: profiles.map((row) => ({
      id: stringField(row, 'id'),
      name: stringField(row, 'full_name', stringField(row, 'email')),
      email: stringField(row, 'email'),
      role: normalizeRole(stringField(row, 'role')),
      phone: stringField(row, 'phone'),
      status: stringField(row, 'employment_status').toLowerCase() === 'inactive' ? 'inactive' : 'active',
    })),
    customers,
    equipment: rows('equipment').map((row): Equipment => ({
      id: stringField(row, 'id'),
      equipmentId: stringField(row, 'equipment_id'),
      customerId: customerById.get(stringField(row, 'customer_id'))?.customerId ?? stringField(row, 'customer_id'),
      installationAddress: stringField(row, 'installation_address'),
      category: stringField(row, 'category'),
      manufacturer: stringField(row, 'manufacturer'),
      model: stringField(row, 'model'),
      serialNumber: stringField(row, 'serial_number'),
      quantity: numberField(row, 'quantity', 1),
      installationDate: dateField(row, 'installation_date'),
      warrantyExpiry: dateField(row, 'warranty_expiry'),
      condition: stringField(row, 'condition', 'Good'),
      status: stringField(row, 'status', 'Active'),
      technician: stringField(profileById.get(stringField(row, 'technician_id')) ?? {}, 'full_name'),
      notes: stringField(row, 'notes'),
    })),
    jobs,
    quotations,
    maintenance,
    invoices,
    staff: rows('staff').map((row): StaffMember => ({
      id: stringField(row, 'id'),
      staffId: stringField(row, 'staff_id'),
      fullName: stringField(row, 'full_name'),
      phone: stringField(row, 'phone'),
      email: stringField(row, 'email'),
      role: normalizeRole(stringField(row, 'role')),
      employmentStatus: ['Active', 'On leave', 'Terminated'].find((status) => status === stringField(row, 'employment_status')) as StaffMember['employmentStatus'] ?? 'Active',
      dateJoined: dateField(row, 'date_joined'),
      skills: stringField(row, 'skills'),
      notes: stringField(row, 'notes'),
    })),
    notifications: rows('notifications').map((row): NotificationItem => ({
      id: stringField(row, 'id'),
      title: stringField(row, 'title'),
      message: stringField(row, 'message'),
      type: ['job', 'quotation', 'invoice', 'maintenance', 'system'].find((type) => type === stringField(row, 'type')) as NotificationType ?? 'system',
      read: row.is_read === true,
      createdAt: stringField(row, 'created_at'),
    })),
    companySettings,
  }
}

const loadSupabaseAppState = async (): Promise<AppState> => {
  if (!supabase) throw new Error('Supabase is not configured.')
  const client = supabase
  const tableNames = ['profiles', 'customers', 'equipment', 'jobs', 'job_assignments', 'job_notes', 'quotations', 'quotation_items', 'maintenance_agreements', 'maintenance_visits', 'invoices', 'invoice_items', 'payments', 'staff', 'notifications', 'documents', 'company_settings', 'activity_logs']
  const results = await Promise.all([
    client.from('profiles').select('*'),
    client.from('customers').select('*'),
    client.from('equipment').select('*'),
    client.from('jobs').select('*'),
    client.from('job_assignments').select('*'),
    client.from('job_notes').select('*'),
    client.from('quotations').select('*'),
    client.from('quotation_items').select('*'),
    client.from('maintenance_agreements').select('*'),
    client.from('maintenance_visits').select('*'),
    client.from('invoices').select('*'),
    client.from('invoice_items').select('*'),
    client.from('payments').select('*'),
    client.from('staff').select('*'),
    client.from('notifications').select('*'),
    client.from('documents').select('*'),
    client.from('company_settings').select('*'),
    client.from('activity_logs').select('*'),
  ])
  const failedResult = results.find((result) => result.error)
  if (failedResult?.error) {
    const failedIndex = results.indexOf(failedResult)
    throw new Error(`${tableNames[failedIndex]}: ${failedResult.error.message}`)
  }

  return mapSupabaseAppState(Object.fromEntries(
    results.map((result, index) => [tableNames[index], result.data]),
  ))
}

const AppStateContext = createContext<{
  appState: AppState
  session: UserProfile | null
  authLoading: boolean
  dataLoading: boolean
  dataError: string
  login: (email: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  refreshData: () => Promise<boolean>
  refreshSettings: (settings: CompanySettings) => void
  updateState: (updater: (current: AppState) => AppState) => void
} | null>(null)

function AppProvider({ children }: { children: ReactNode }) {
  const [appState, setAppState] = useState<AppState>(loadState)
  const [session, setSession] = useState<UserProfile | null>(() => isSupabaseConfigured ? null : loadSession())
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured)
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(appState))
  }, [appState])

  useEffect(() => {
    if (typeof window === 'undefined') return

    if (session) {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } else {
      window.localStorage.removeItem(SESSION_KEY)
    }
  }, [session])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      return
    }

    const client = supabase
    let isActive = true

    const syncSession = async () => {
      const { data: { session: activeSession }, error } = await client.auth.getSession()
      if (!isActive) return

      if (error) {
        console.error('Supabase session sync failed:', error)
        setSession(null)
        setAuthLoading(false)
        setDataLoading(false)
        return
      }

      if (!activeSession?.user?.email) {
        setSession(null)
        setAuthLoading(false)
        setDataLoading(false)
        return
      }

      const profile = await getSupabaseProfileFromEmail(activeSession.user.email)
      if (!profile) {
        setSession(null)
        setAuthLoading(false)
        setDataLoading(false)
        return
      }

      setSession(normalizeSupabaseProfile(profile))
      setAuthLoading(false)
    }

    syncSession()

    const { data: { subscription } } = client.auth.onAuthStateChange(async (_event, activeSession) => {
      if (!isActive) return

      if (!activeSession?.user?.email) {
        setSession(null)
        setAuthLoading(false)
        setDataLoading(false)
        return
      }

      const profile = await getSupabaseProfileFromEmail(activeSession.user.email)
      setSession(profile ? normalizeSupabaseProfile(profile) : null)
      setAuthLoading(false)
    })

    return () => {
      isActive = false
      subscription.unsubscribe()
    }
  }, [])

  const refreshData = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !session) {
      return false
    }

    setDataLoading(true)
    setDataError('')
    try {
      setAppState(await loadSupabaseAppState())
      setDataError('')
      return true
    } catch (loadError) {
      setDataError(loadError instanceof Error ? loadError.message : 'Unexpected error loading Supabase data.')
      return false
    } finally {
      setDataLoading(false)
    }
  }, [session])

  useEffect(() => {
    if (!session) return

    const timeout = window.setTimeout(() => {
      void refreshData()
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [refreshData, session])

  const login = async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase()

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      })

      if (error || !data.user?.email) {
        return false
      }

      const profile = await getSupabaseProfileFromEmail(data.user.email)
      if (!profile) {
        await supabase.auth.signOut()
        return false
      }

      setSession(normalizeSupabaseProfile(profile))
      setAuthLoading(false)
      return true
    }

    const matched = appState.users.find((user) => user.email.toLowerCase() === normalizedEmail)
    if (!matched || password.length < 6) {
      return false
    }

    setSession(matched)
    return true
  }

  const logout = async () => {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut()
    }

    setSession(null)
    setAuthLoading(false)
    setDataLoading(false)
  }

  const refreshSettings = (settings: CompanySettings) => {
    setAppState((current) => ({ ...current, companySettings: settings }))
  }

  const updateState = useCallback((updater: (current: AppState) => AppState) => {
    setAppState((current) => updater(current))
  }, [])

  const contextValue = { appState, session, authLoading, dataLoading, dataError, login, logout, refreshData, refreshSettings, updateState }

  return <AppStateContext.Provider value={contextValue}>{children}</AppStateContext.Provider>
}

function useAppContext() {
  const context = useContext(AppStateContext)
  if (!context) {
    throw new Error('App state context not found')
  }
  return context
}

function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </AppProvider>
  )
}

function AppShell() {
  const { session, authLoading, refreshData } = useAppContext()

  if (authLoading) {
    return <div role="status" className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">Checking secure session...</div>
  }

  return (
    <Routes>
      <Route path="/" element={session ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route element={session ? <AppLayout /> : <Navigate to="/" replace />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/customers" element={<RoleGuard roles={['ADMIN', 'OFFICE_ADMIN']}><CustomersPage /></RoleGuard>} />
        <Route path="/equipment" element={<EquipmentPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/quotations" element={<RoleGuard roles={['ADMIN', 'OFFICE_ADMIN']}><QuotationsPage /></RoleGuard>} />
        <Route path="/maintenance" element={<MaintenancePage />} />
        <Route path="/invoices" element={<RoleGuard roles={['ADMIN', 'OFFICE_ADMIN']}><InvoicesPage /></RoleGuard>} />
        <Route path="/staff" element={<RoleGuard roles={['ADMIN']}><StaffPage /></RoleGuard>} />
        <Route path="/reports" element={<RoleGuard roles={['ADMIN', 'OFFICE_ADMIN']}><ReportsPage /></RoleGuard>} />
        <Route path="/settings" element={<RoleGuard roles={['ADMIN']}><SettingsPage /></RoleGuard>} />
        <Route path="/data" element={<RoleGuard roles={['ADMIN']}><SupabaseDataManager onDataChanged={refreshData} /></RoleGuard>} />
      </Route>
    </Routes>
  )
}

function RoleGuard({ roles: allowedRoles, children }: { roles: Role[]; children: ReactNode }) {
  const { session } = useAppContext()
  return session && allowedRoles.includes(session.role) ? children : <Navigate to="/dashboard" replace />
}

function AppLayout() {
  const { session, appState, dataLoading, dataError, logout } = useAppContext()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const location = useLocation()
  const pageTitle = navItems.find((item) => item.to === location.pathname)?.label ?? 'Dashboard'

  const unreadNotifications = appState.notifications.filter((item) => !item.read).length

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <div className="flex min-h-screen">
        <aside className={`fixed inset-y-0 left-0 z-30 w-72 border-r border-slate-200 bg-[#101B2B] text-slate-100 transition-transform duration-200 md:static md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex h-20 items-center justify-between border-b border-slate-700 px-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2675D8] text-sm font-bold">AS</div>
              <div>
                <p className="text-lg font-semibold">Access Surveillance</p>
                <p className="text-xs text-slate-300">Business management</p>
              </div>
            </div>
            <button className="rounded-md p-2 text-slate-300 md:hidden" aria-label="close sidebar" onClick={() => setMobileOpen(false)}>
              <X size={20} />
            </button>
          </div>
          <nav className="space-y-2 p-4">
            {navItems.map(({ label, to, icon: Icon, roles: allowedRoles }) => {
              if (session && !allowedRoles.includes(session.role)) return null
              return (
                <NavLink key={to} to={to} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-[#2675D8] text-white shadow-sm' : 'text-slate-200 hover:bg-slate-800'}`} onClick={() => setMobileOpen(false)}>
                  <Icon size={18} />
                  {label}
                </NavLink>
              )
            })}
          </nav>

          <div className="mt-auto border-t border-slate-700 p-4">
            <div className="mb-3 flex items-center gap-3 rounded-xl bg-slate-800/80 p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#C6A15B] font-semibold text-[#101B2B]">{session?.name.split(' ').map((part) => part[0]).slice(0,2).join('')}</div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{session?.name}</p>
                <p className="text-xs text-slate-300">{session?.role}</p>
              </div>
            </div>
            <div className="space-y-2 text-sm text-slate-300">
              {session?.role === 'ADMIN' && (
                <button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 hover:bg-slate-800" onClick={() => window.location.assign('/settings')}>
                  <Settings size={16} />
                  Settings
                </button>
              )}
              <button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 hover:bg-slate-800" onClick={logout}>
                <LogOut size={16} />
                Logout
              </button>
            </div>
          </div>
        </aside>

        <div className="flex-1">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-6">
              <div className="flex items-center gap-3">
                <button className="rounded-lg border border-slate-200 p-2 md:hidden" aria-label="open sidebar" onClick={() => setMobileOpen(true)}>
                  <Menu size={18} />
                </button>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Operations</p>
                  <h1 className="text-xl font-semibold text-slate-900">{pageTitle}</h1>
                </div>
              </div>

              <div className="hidden flex-1 items-center justify-end gap-3 md:flex">
                <div className="relative w-full max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#2675D8]" placeholder="Search" />
                </div>
                <div className="relative">
                  <button className="relative rounded-xl border border-slate-200 p-2.5 text-slate-600" aria-label="notifications" onClick={() => setNotificationsOpen((value) => !value)}>
                    <Bell size={18} />
                    {unreadNotifications > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unreadNotifications}</span>
                    )}
                  </button>
                  {notificationsOpen && (
                    <div className="absolute right-0 top-12 w-80 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="font-semibold text-slate-900">Notifications</p>
                        <button className="text-xs text-[#2675D8]" onClick={() => setNotificationsOpen(false)}>Close</button>
                      </div>
                      <div className="space-y-2">
                        {appState.notifications.slice(0, 4).map((item) => (
                          <div key={item.id} className={`rounded-xl border p-2 ${item.read ? 'border-slate-200 bg-slate-50' : 'border-[#2675D8]/30 bg-[#2675D8]/5'}`}>
                            <p className="text-sm font-medium text-slate-900">{item.title}</p>
                            <p className="mt-1 text-xs text-slate-500">{item.message}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">{format(new Date(), 'EEEE, d MMMM yyyy')}</div>
              </div>

              <div className="flex items-center gap-3 md:hidden">
                <div className="relative">
                  <button className="relative rounded-xl border border-slate-200 p-2 text-slate-600" aria-label="notifications mobile" onClick={() => setNotificationsOpen((value) => !value)}>
                    <Bell size={18} />
                    {unreadNotifications > 0 && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500"></span>}
                  </button>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#101B2B] text-sm font-semibold text-white">{session?.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div>
              </div>
            </div>
          </header>

          <main className="p-4 md:p-6">
            {dataLoading && <div role="status" className="mb-4 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-700">Loading business records from Supabase...</div>}
            {dataError && <div role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">Supabase data could not be loaded: {dataError}</div>}
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}

function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAppContext()
  const [showPassword, setShowPassword] = useState(false)
  const [rememberEmail, setRememberEmail] = useState(() => Boolean(loadRememberedEmail()))
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: loadRememberedEmail(),
      password: '',
    },
  })

  const onSubmit = async (values: z.infer<typeof loginSchema>) => {
    setPending(true)
    setError('')

    try {
      if (rememberEmail) {
        window.localStorage.setItem(REMEMBERED_EMAIL_KEY, values.email.trim())
      } else {
        window.localStorage.removeItem(REMEMBERED_EMAIL_KEY)
      }

      const allowed = await login(values.email, values.password)
      if (allowed) {
        navigate('/dashboard')
        return
      }

      setError('Invalid email or password. Use a real Supabase-authenticated account or complete the matching profile record.')
    } catch {
      setError('The sign-in request failed. Please confirm your credentials and try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0B1220] px-4 py-10 text-slate-100 md:px-8">
      <div className="mx-auto grid max-w-6xl gap-6 overflow-hidden rounded-3xl border border-slate-700 bg-slate-900/80 shadow-2xl md:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col justify-between bg-gradient-to-br from-[#101B2B] via-[#0F1F39] to-[#122A45] p-8 md:p-12">
          <div>
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2675D8] font-bold text-white">AS</div>
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-300">Secure operations</p>
                <h1 className="text-2xl font-semibold">Access Surveillance</h1>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-700 bg-white/5 p-4">
                <p className="text-sm text-slate-300">Business management platform</p>
                <h2 className="mt-2 text-4xl font-semibold tracking-tight text-white">Operations, maintenance and reporting in one place.</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <FeatureCard icon={ShieldCheck} title="Role-based access" text="Secure ACLs, admin approval flows and technician scope controls." />
                <FeatureCard icon={ClipboardList} title="Live jobs" text="Track schedules, approvals, job cards and site notes in real time." />
                <FeatureCard icon={CircleDollarSign} title="Financial clarity" text="Invoices, quotations, VAT settings and outstanding balances." />
                <FeatureCard icon={Building2} title="Asset register" text="Customers, equipment, maintenance and service history in one system." />
              </div>
            </div>
          </div>
          <div className="mt-8 text-sm text-slate-300">
            {isSupabaseConfigured
              ? 'Sign in with your real Supabase Auth account and matching staff profile.'
              : 'Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable real authentication.'}
          </div>
        </div>

        <div className="p-8 md:p-12">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Welcome back</p>
            <h2 className="mt-3 text-3xl font-semibold text-white">Sign in</h2>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} autoComplete="on">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">Email address</label>
              <input type="email" autoComplete="username" {...register('email')} className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-white outline-none focus:border-[#2675D8]" placeholder="you@company.com" />
              {errors.email && <p className="mt-2 text-sm text-red-400">{errors.email.message}</p>}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">Password</label>
              <div className="flex items-center rounded-xl border border-slate-600 bg-slate-800 px-4">
                <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" {...register('password')} className="w-full bg-transparent py-3 text-white outline-none" placeholder="Enter password" />
                <button type="button" className="px-2 text-sm text-slate-300" onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Hide' : 'Show'}</button>
              </div>
              {errors.password && <p className="mt-2 text-sm text-red-400">{errors.password.message}</p>}
            </div>

            <div className="flex items-center justify-between text-sm text-slate-300">
              <label className="flex items-center gap-2"><input type="checkbox" checked={rememberEmail} onChange={(event) => setRememberEmail(event.target.checked)} className="rounded border-slate-500 bg-slate-800" /> Remember email</label>
              <button type="button" className="text-[#7fb5ff]">Forgot password?</button>
            </div>

            {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}

            <button type="submit" disabled={pending} className="w-full rounded-xl bg-[#2675D8] px-4 py-3 font-medium text-white transition hover:bg-[#1f5ea8] disabled:cursor-not-allowed disabled:opacity-60">
              {pending ? 'Signing in...' : 'Login'}
            </button>

            <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-4 text-sm text-slate-300">
              <p className="font-medium text-white">Access requirements</p>
              <p className="mt-2">New users must exist in Supabase Auth and have an active profile row with a valid role before they can log in to the dashboard.</p>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

function FeatureCard({ icon: Icon, title, text }: { icon: any; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-4">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#2675D8]/15 text-[#7fb5ff]">
        <Icon size={18} />
      </div>
      <p className="font-medium text-white">{title}</p>
      <p className="mt-2 text-sm text-slate-300">{text}</p>
    </div>
  )
}

function DashboardPage() {
  const { appState } = useAppContext()

  const metrics = useMemo(() => {
    const totalCustomers = appState.customers.length
    const activeJobs = appState.jobs.filter((job) => ['Scheduled', 'In progress', 'Awaiting parts', 'Approved', 'New'].includes(job.status)).length
    const completedThisMonth = appState.jobs.filter((job) => job.status === 'Completed').length
    const pendingQuotations = appState.quotations.filter((q) => q.status === 'Awaiting approval' || q.status === 'Sent').length
    const outstandingInvoices = appState.invoices.reduce((total, invoice) => total + invoice.outstandingBalance, 0)
    const monthlyRevenue = appState.invoices.reduce((total, invoice) => total + invoice.amountPaid, 0)
    const upcomingMaintenance = appState.maintenance.filter((m) => m.status === 'Active').length
    const installedEquipment = appState.equipment.filter((item) => item.status === 'Active').length

    return { totalCustomers, activeJobs, completedThisMonth, pendingQuotations, outstandingInvoices, monthlyRevenue, upcomingMaintenance, installedEquipment }
  }, [appState])

  const revenueChart = [
    { month: 'Jan', revenue: 42000 },
    { month: 'Feb', revenue: 48000 },
    { month: 'Mar', revenue: 54000 },
    { month: 'Apr', revenue: 61000 },
    { month: 'May', revenue: 57000 },
    { month: 'Jun', revenue: 65000 },
    { month: 'Jul', revenue: 69000 },
    { month: 'Aug', revenue: 71500 },
    { month: 'Sep', revenue: 76000 },
    { month: 'Oct', revenue: 82000 },
    { month: 'Nov', revenue: 78000 },
    { month: 'Dec', revenue: 89000 },
  ]

  const completionChart = appState.jobs.map((job) => ({
    name: job.jobReference,
    jobs: 1,
  }))

  const donutData = [
    { name: 'Scheduled', value: appState.jobs.filter((job) => job.status === 'Scheduled').length },
    { name: 'In progress', value: appState.jobs.filter((job) => job.status === 'In progress').length },
    { name: 'Completed', value: appState.jobs.filter((job) => job.status === 'Completed').length },
    { name: 'Awaiting parts', value: appState.jobs.filter((job) => job.status === 'Awaiting parts').length },
  ]

  const pieColors = ['#2675D8', '#C6A15B', '#16A36A', '#D94A4A']

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} title="Total customers" value={String(metrics.totalCustomers)} subtitle="Across all active accounts" color="blue" />
        <StatCard icon={ClipboardList} title="Active jobs" value={String(metrics.activeJobs)} subtitle="Currently in motion" color="amber" />
        <StatCard icon={CheckCircle2} title="Completed jobs" value={String(metrics.completedThisMonth)} subtitle="This month" color="green" />
        <StatCard icon={CircleDollarSign} title="Outstanding invoices" value={formatCurrency(metrics.outstandingInvoices)} subtitle="Current balances" color="red" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={FileText} title="Pending quotations" value={String(metrics.pendingQuotations)} subtitle="Awaiting approval" color="gold" />
        <StatCard icon={CreditCard} title="Monthly revenue" value={formatCurrency(metrics.monthlyRevenue)} subtitle="Collected this month" color="green" />
        <StatCard icon={CalendarDays} title="Upcoming maintenance" value={String(metrics.upcomingMaintenance)} subtitle="Scheduled visits" color="blue" />
        <StatCard icon={Wrench} title="Installed equipment" value={String(metrics.installedEquipment)} subtitle="Active asset count" color="navy" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Panel title="Monthly revenue" action="This year">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueChart}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#2675D8" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#2675D8" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `R${Math.round(value / 1000)}k`} />
                <Tooltip formatter={(value) => [formatCurrency(Number(value ?? 0)), 'Revenue']} />
                <Area type="monotone" dataKey="revenue" stroke="#2675D8" fill="url(#revenueFill)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Job status distribution" action="Live">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {donutData.map((entry, index) => (
                    <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`${Number(value ?? 0)} jobs`, 'Count']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Panel title="Recent jobs" action="View all">
          <div className="space-y-3">
            {appState.jobs.slice(0, 4).map((job) => (
              <div key={job.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div>
                  <p className="font-medium text-slate-900">{job.jobReference}</p>
                  <p className="text-sm text-slate-600">{job.customer} · {job.category}</p>
                </div>
                <div className="text-right">
                  <div className={getStatusClass(job.status)}>{job.status}</div>
                  <p className="mt-2 text-xs text-slate-500">{job.scheduledDate}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Upcoming maintenance" action="Calendar">
          <div className="space-y-3">
            {appState.maintenance.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-slate-900">{item.customer}</p>
                  <span className={getStatusClass(item.status)}>{item.status}</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">Next visit: {item.nextServiceDate}</p>
                <p className="text-xs text-slate-500">Frequency: {item.serviceFrequency}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Panel title="Customer growth" action="12-month view">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={completionChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="jobs" fill="#16A36A" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Recent activity" action="Audit trail">
          <div className="space-y-3">
            {appState.notifications.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="font-medium text-slate-900">{item.title}</p>
                <p className="mt-1 text-sm text-slate-600">{item.message}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}

function CustomersPage() {
  const { appState, dataLoading, updateState } = useAppContext()
  const [form, setForm] = useState<{
    customerId: string
    fullName: string
    type: CustomerType
    contactPerson: string
    phone: string
    email: string
    address: string
    suburb: string
    city: string
    province: string
    postalCode: string
    notes: string
  }>({
    customerId: '',
    fullName: '',
    type: 'Residential',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    suburb: '',
    city: '',
    province: '',
    postalCode: '',
    notes: '',
  })
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const activeCustomers = appState.customers

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const fullName = form.fullName.trim()
    if (!fullName) {
      setError('Enter the customer name before saving.')
      return
    }

    const customerId = form.customerId.trim()
      || `AS-CUS-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
    const nextCustomer: Customer = {
      id: `c-${Date.now()}`,
      customerId,
      fullName,
      type: form.type,
      contactPerson: form.contactPerson.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
      suburb: form.suburb.trim(),
      city: form.city.trim(),
      province: form.province.trim(),
      postalCode: form.postalCode.trim(),
      notes: form.notes.trim(),
      dateAdded: new Date().toISOString().slice(0, 10),
    }

    setIsSaving(true)
    setError('')

    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error: saveError } = await supabase
          .from('customers')
          .insert({
            customer_id: nextCustomer.customerId,
            full_name: nextCustomer.fullName,
            customer_type: nextCustomer.type,
            contact_person: nextCustomer.contactPerson || null,
            phone: nextCustomer.phone || null,
            email: nextCustomer.email || null,
            address: nextCustomer.address || null,
            suburb: nextCustomer.suburb || null,
            city: nextCustomer.city || null,
            province: nextCustomer.province || null,
            postal_code: nextCustomer.postalCode || null,
            notes: nextCustomer.notes || null,
            date_added: nextCustomer.dateAdded,
          })
          .select('*')
          .single()

        if (saveError) {
          setError(`Could not save customer: ${saveError.message}`)
          return
        }

        if (!data) {
          setError('Customer was saved, but Supabase returned no customer record.')
          return
        }

        const savedCustomer = mapCustomerRecord(data)
        updateState((current) => ({ ...current, customers: [savedCustomer, ...current.customers] }))
      } else {
        updateState((current) => ({ ...current, customers: [nextCustomer, ...current.customers] }))
      }

      setForm({
        customerId: '',
        fullName: '',
        type: 'Residential',
        contactPerson: '',
        phone: '',
        email: '',
        address: '',
        suburb: '',
        city: '',
        province: '',
        postalCode: '',
        notes: '',
      })
    } catch (submitError) {
      setError(`Could not save customer: ${submitError instanceof Error ? submitError.message : 'Unexpected error.'}`)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <SectionToolbar title="Customer management" buttonLabel="Add customer" />
      {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel title="Customer records" action={`${activeCustomers.length} active`}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-3 pr-4 font-medium">Customer</th>
                  <th className="py-3 pr-4 font-medium">Type</th>
                  <th className="py-3 pr-4 font-medium">City</th>
                  <th className="py-3 pr-4 font-medium">Contact</th>
                  <th className="py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                  {dataLoading && <tr><td colSpan={5} className="py-6 text-center text-slate-500">Loading customers...</td></tr>}
                  {!dataLoading && activeCustomers.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-slate-500">No customers found.</td></tr>}
                {activeCustomers.map((customer) => (
                  <tr key={customer.id} className="border-b border-slate-200 last:border-b-0">
                    <td className="py-3 pr-4">
                      <div>
                        <p className="font-medium text-slate-900">{customer.fullName}</p>
                        <p className="text-xs text-slate-500">{customer.customerId}</p>
                      </div>
                    </td>
                    <td className="py-3 pr-4"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">{customer.type}</span></td>
                    <td className="py-3 pr-4 text-slate-600">{customer.city}</td>
                    <td className="py-3 pr-4 text-slate-600">{customer.contactPerson}</td>
                    <td className="py-3">
                      <RecordActions
                        tableName="customers"
                        recordId={customer.id}
                        title="customer"
                        fields={customerEditFields}
                        initialValues={{
                          customer_id: customer.customerId,
                          full_name: customer.fullName,
                          customer_type: customer.type,
                          contact_person: customer.contactPerson,
                          phone: customer.phone,
                          email: customer.email,
                          address: customer.address,
                          suburb: customer.suburb,
                          city: customer.city,
                          province: customer.province,
                          postal_code: customer.postalCode,
                          notes: customer.notes,
                        }}
                        onLocalSave={(values) => updateState((current) => ({
                          ...current,
                          customers: current.customers.map((item) => item.id === customer.id ? {
                            ...item,
                            customerId: values.customer_id,
                            fullName: values.full_name,
                            type: values.customer_type as CustomerType,
                            contactPerson: values.contact_person,
                            phone: values.phone,
                            email: values.email,
                            address: values.address,
                            suburb: values.suburb,
                            city: values.city,
                            province: values.province,
                            postalCode: values.postal_code,
                            notes: values.notes,
                          } : item),
                        }))}
                        onLocalDelete={() => updateState((current) => ({ ...current, customers: current.customers.filter((item) => item.id !== customer.id) }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Add customer" action="Profile">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name"><input required value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} className="input" /></Field>
              <Field label="Customer type"><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as CustomerType })} className="input"><option value="Residential">Residential</option><option value="Commercial">Commercial</option></select></Field>
              <Field label="Contact person"><input value={form.contactPerson} onChange={(event) => setForm({ ...form, contactPerson: event.target.value })} className="input" /></Field>
              <Field label="Phone"><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="input" /></Field>
              <Field label="Email"><input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="input sm:col-span-2" /></Field>
              <Field label="Address"><input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} className="input sm:col-span-2" /></Field>
              <Field label="Suburb"><input value={form.suburb} onChange={(event) => setForm({ ...form, suburb: event.target.value })} className="input" /></Field>
              <Field label="City"><input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} className="input" /></Field>
              <Field label="Province"><input value={form.province} onChange={(event) => setForm({ ...form, province: event.target.value })} className="input" /></Field>
              <Field label="Postal code"><input value={form.postalCode} onChange={(event) => setForm({ ...form, postalCode: event.target.value })} className="input" /></Field>
            </div>
            <Field label="Notes"><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="input min-h-24" /></Field>
            <button type="submit" disabled={isSaving} className="w-full rounded-xl bg-[#101B2B] px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60">{isSaving ? 'Saving...' : 'Save customer'}</button>
          </form>
        </Panel>
      </div>
    </div>
  )
}

function EquipmentPage() {
  const { appState, refreshData, updateState } = useAppContext()
  const [creating, setCreating] = useState(false)
  const customerOptions = [{ value: '', label: 'No customer selected' }, ...appState.customers.map((customer) => ({ value: customer.id, label: customer.fullName }))]
  const technicianOptions = [{ value: '', label: 'Unassigned' }, ...appState.users.map((user) => ({ value: user.id, label: user.name }))]

  const saveEquipment = async (values: Record<string, string>) => {
    const equipmentId = values.equipmentId.trim() || createReference('AS-EQ')
    const quantity = Math.max(1, Number(values.quantity) || 1)

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('equipment').insert({
        equipment_id: equipmentId,
        customer_id: values.customerId || null,
        installation_address: values.installationAddress || null,
        category: values.category.trim(),
        manufacturer: values.manufacturer || null,
        model: values.model.trim(),
        serial_number: values.serialNumber || null,
        quantity,
        installation_date: values.installationDate || null,
        warranty_expiry: values.warrantyExpiry || null,
        condition: values.condition || 'Good',
        status: values.status || 'Active',
        technician_id: values.technicianId || null,
        notes: values.notes || null,
      })
      if (error) throw new Error(error.message)
      if (!await refreshData()) throw new Error('Equipment was saved, but the latest records could not be reloaded.')
      return
    }

    const technician = appState.users.find((user) => user.id === values.technicianId)
    const equipment: Equipment = {
      id: createReference('local-equipment'),
      equipmentId,
      customerId: values.customerId,
      installationAddress: values.installationAddress,
      category: values.category,
      manufacturer: values.manufacturer,
      model: values.model,
      serialNumber: values.serialNumber,
      quantity,
      installationDate: values.installationDate,
      warrantyExpiry: values.warrantyExpiry,
      condition: values.condition || 'Good',
      status: values.status || 'Active',
      technician: technician?.name ?? '',
      notes: values.notes,
    }
    updateState((current) => ({ ...current, equipment: [equipment, ...current.equipment] }))
  }

  return (
    <div className="space-y-6">
      <SectionToolbar title="Equipment register" buttonLabel="Add equipment" onAction={() => setCreating(true)} />
      <Panel title="Installed assets" action={`${appState.equipment.length} items`}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-3 pr-4 font-medium">Equipment</th>
                <th className="py-3 pr-4 font-medium">Customer</th>
                <th className="py-3 pr-4 font-medium">Category</th>
                <th className="py-3 pr-4 font-medium">Status</th>
                <th className="py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {appState.equipment.map((item) => (
                <tr key={item.id} className="border-b border-slate-200 last:border-b-0">
                  <td className="py-3 pr-4">
                    <p className="font-medium text-slate-900">{item.model}</p>
                    <p className="text-xs text-slate-500">{item.equipmentId}</p>
                  </td>
                  <td className="py-3 pr-4 text-slate-600">{item.customerId}</td>
                  <td className="py-3 pr-4 text-slate-600">{item.category}</td>
                  <td className="py-3 pr-4"><span className={getStatusClass(item.status)}>{item.status}</span></td>
                  <td className="py-3">
                    <RecordActions
                      tableName="equipment"
                      recordId={item.id}
                      title="equipment"
                      fields={equipmentEditFields}
                      initialValues={{
                        equipment_id: item.equipmentId,
                        customer_id: item.customerId,
                        installation_address: item.installationAddress,
                        category: item.category,
                        manufacturer: item.manufacturer,
                        model: item.model,
                        serial_number: item.serialNumber,
                        quantity: String(item.quantity),
                        installation_date: item.installationDate,
                        warranty_expiry: item.warrantyExpiry,
                        condition: item.condition,
                        status: item.status,
                        technician_id: item.technician,
                        notes: item.notes,
                        associated_job_id: '',
                      }}
                      toPayload={(values) => ({
                        equipment_id: values.equipment_id,
                        customer_id: values.customer_id || null,
                        installation_address: values.installation_address || null,
                        category: values.category,
                        manufacturer: values.manufacturer || null,
                        model: values.model,
                        serial_number: values.serial_number || null,
                        quantity: Number(values.quantity),
                        installation_date: values.installation_date || null,
                        warranty_expiry: values.warranty_expiry || null,
                        condition: values.condition,
                        status: values.status,
                        technician_id: values.technician_id || null,
                        notes: values.notes || null,
                        associated_job_id: values.associated_job_id || null,
                      })}
                      onLocalSave={(values) => updateState((current) => ({
                        ...current,
                        equipment: current.equipment.map((entry) => entry.id === item.id ? {
                          ...entry,
                          equipmentId: values.equipment_id,
                          customerId: values.customer_id,
                          installationAddress: values.installation_address,
                          category: values.category,
                          manufacturer: values.manufacturer,
                          model: values.model,
                          serialNumber: values.serial_number,
                          quantity: Number(values.quantity),
                          installationDate: values.installation_date,
                          warrantyExpiry: values.warranty_expiry,
                          condition: values.condition,
                          status: values.status,
                          technician: values.technician_id,
                          notes: values.notes,
                        } : entry),
                      }))}
                      onLocalDelete={() => updateState((current) => ({ ...current, equipment: current.equipment.filter((entry) => entry.id !== item.id) }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      {creating && (
        <QuickCreateModal
          title="Add equipment"
          onClose={() => setCreating(false)}
          onSave={saveEquipment}
          fields={[
            { name: 'equipmentId', label: 'Equipment ID (optional)', required: false },
            { name: 'customerId', label: 'Customer', type: 'select', required: false, options: customerOptions },
            { name: 'category', label: 'Category' },
            { name: 'manufacturer', label: 'Manufacturer', required: false },
            { name: 'model', label: 'Model' },
            { name: 'serialNumber', label: 'Serial number', required: false },
            { name: 'quantity', label: 'Quantity', type: 'number', min: '1', step: '1' },
            { name: 'installationAddress', label: 'Installation address', required: false },
            { name: 'installationDate', label: 'Installation date', type: 'date', required: false },
            { name: 'warrantyExpiry', label: 'Warranty expiry', type: 'date', required: false },
            { name: 'technicianId', label: 'Technician', type: 'select', required: false, options: technicianOptions },
            { name: 'notes', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}
    </div>
  )
}

function JobsPage() {
  const { appState, refreshData, updateState } = useAppContext()
  const [creating, setCreating] = useState(false)
  const customerOptions = [{ value: '', label: 'Select customer' }, ...appState.customers.map((customer) => ({ value: customer.id, label: customer.fullName }))]
  const technicianOptions = [{ value: '', label: 'Unassigned' }, ...appState.users.map((user) => ({ value: user.id, label: user.name }))]

  const saveJob = async (values: Record<string, string>) => {
    const jobReference = createReference('AS-J')
    const equipment = values.equipment.split(',').map((item) => item.trim()).filter(Boolean)

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('jobs').insert({
        job_reference: jobReference,
        customer_id: values.customerId || null,
        category: values.category.trim(),
        description: values.description || null,
        site_address: values.siteAddress || null,
        priority: values.priority || 'Medium',
        assigned_technician_id: values.technicianId || null,
        scheduled_date: values.scheduledDate || null,
        scheduled_time: values.scheduledTime || null,
        status: values.status || 'New',
        equipment_list: equipment,
        customer_instructions: values.customerInstructions || null,
        internal_notes: values.internalNotes || null,
      })
      if (error) throw new Error(error.message)
      if (!await refreshData()) throw new Error('Job was saved, but the latest records could not be reloaded.')
      return
    }

    const customer = appState.customers.find((item) => item.id === values.customerId)
    const technician = appState.users.find((item) => item.id === values.technicianId)
    const job: Job = {
      id: createReference('local-job'),
      jobReference,
      customer: customer?.fullName ?? '',
      category: values.category,
      description: values.description,
      siteAddress: values.siteAddress,
      priority: (values.priority || 'Medium') as Job['priority'],
      assignedTechnician: technician?.name ?? '',
      scheduledDate: values.scheduledDate,
      scheduledTime: values.scheduledTime,
      status: (values.status || 'New') as JobStatus,
      equipment: equipment.join(', '),
      customerInstructions: values.customerInstructions,
      internalNotes: values.internalNotes,
      completionDate: '',
    }
    updateState((current) => ({ ...current, jobs: [job, ...current.jobs] }))
  }

  return (
    <div className="space-y-6">
      <SectionToolbar title="Job management" buttonLabel="Create job" onAction={() => setCreating(true)} />
      <Panel title="Live jobs" action={`${appState.jobs.length} records`}>
        <div className="grid gap-4 lg:grid-cols-2">
          {appState.jobs.map((job) => (
            <div key={job.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{job.jobReference}</p>
                  <p className="text-sm text-slate-600">{job.customer}</p>
                </div>
                <span className={getStatusClass(job.status)}>{job.status}</span>
              </div>
              <p className="text-sm text-slate-600">{job.description}</p>
              <div className="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                <p>Category: {job.category}</p>
                <p>Priority: {job.priority}</p>
                <p>Assigned: {job.assignedTechnician}</p>
                <p>Date: {job.scheduledDate}</p>
              </div>
              <div className="mt-4 border-t border-slate-200 pt-3">
                <RecordActions
                  tableName="jobs"
                  recordId={job.id}
                  title="job"
                  fields={jobEditFields}
                  initialValues={{
                    customer_id: job.customer,
                    category: job.category,
                    description: job.description,
                    site_address: job.siteAddress,
                    priority: job.priority,
                    assigned_technician_id: job.assignedTechnician,
                    scheduled_date: job.scheduledDate,
                    scheduled_time: job.scheduledTime,
                    status: job.status,
                    equipment_list: job.equipment,
                    customer_instructions: job.customerInstructions,
                    internal_notes: job.internalNotes,
                    completion_date: job.completionDate,
                  }}
                  toPayload={(values) => ({
                    customer_id: values.customer_id || null,
                    category: values.category,
                    description: values.description || null,
                    site_address: values.site_address || null,
                    priority: values.priority,
                    assigned_technician_id: values.assigned_technician_id || null,
                    scheduled_date: values.scheduled_date || null,
                    scheduled_time: values.scheduled_time || null,
                    status: values.status,
                    equipment_list: values.equipment_list.split(',').map((entry) => entry.trim()).filter(Boolean),
                    customer_instructions: values.customer_instructions || null,
                    internal_notes: values.internal_notes || null,
                    completion_date: values.completion_date || null,
                  })}
                  onLocalSave={(values) => {
                    const customer = appState.customers.find((entry) => entry.fullName === values.customer_id)
                    const technician = appState.users.find((entry) => entry.name === values.assigned_technician_id)
                    updateState((current) => ({
                      ...current,
                      jobs: current.jobs.map((entry) => entry.id === job.id ? {
                        ...entry,
                        customer: customer?.fullName ?? values.customer_id,
                        category: values.category,
                        description: values.description,
                        siteAddress: values.site_address,
                        priority: values.priority as Job['priority'],
                        assignedTechnician: technician?.name ?? values.assigned_technician_id,
                        scheduledDate: values.scheduled_date,
                        scheduledTime: values.scheduled_time,
                        status: values.status as JobStatus,
                        equipment: values.equipment_list,
                        customerInstructions: values.customer_instructions,
                        internalNotes: values.internal_notes,
                        completionDate: values.completion_date,
                      } : entry),
                    }))
                  }}
                  onLocalDelete={() => updateState((current) => ({ ...current, jobs: current.jobs.filter((entry) => entry.id !== job.id) }))}
                />
              </div>
            </div>
          ))}
        </div>
      </Panel>
      {creating && (
        <QuickCreateModal
          title="Create job"
          onClose={() => setCreating(false)}
          onSave={saveJob}
          fields={[
            { name: 'customerId', label: 'Customer', type: 'select', options: customerOptions },
            { name: 'category', label: 'Category' },
            { name: 'description', label: 'Description', type: 'textarea', required: false },
            { name: 'siteAddress', label: 'Site address', required: false },
            { name: 'priority', label: 'Priority', type: 'select', options: ['Low', 'Medium', 'High', 'Urgent'].map((value) => ({ value, label: value })) },
            { name: 'technicianId', label: 'Assigned technician', type: 'select', required: false, options: technicianOptions },
            { name: 'scheduledDate', label: 'Scheduled date', type: 'date', required: false },
            { name: 'scheduledTime', label: 'Scheduled time', required: false },
            { name: 'status', label: 'Status', type: 'select', options: ['New', 'Scheduled', 'In progress', 'Awaiting parts', 'Completed', 'Cancelled'].map((value) => ({ value, label: value })) },
            { name: 'equipment', label: 'Equipment (comma separated)', required: false },
            { name: 'customerInstructions', label: 'Customer instructions', type: 'textarea', required: false },
            { name: 'internalNotes', label: 'Internal notes', type: 'textarea', required: false },
          ]}
        />
      )}
    </div>
  )
}

function QuotationsPage() {
  const { appState, refreshData, updateState } = useAppContext()
  const [creating, setCreating] = useState(false)
  const customerOptions = [{ value: '', label: 'Select customer' }, ...appState.customers.map((customer) => ({ value: customer.id, label: customer.fullName }))]

  const createPdf = (quotation: Quotation) => {
    const doc = new jsPDF()
    doc.setFontSize(18)
    doc.text('Access Surveillance Quote', 14, 20)
    doc.setFontSize(11)
    doc.text(`Quotation: ${quotation.quotationReference}`, 14, 30)
    doc.text(`Customer: ${quotation.customer}`, 14, 38)
    doc.text(`Status: ${quotation.status}`, 14, 46)
    let currentY = 56
    quotation.items.forEach((item) => {
      doc.text(`${item.productService} x${item.quantity} = ${formatCurrency(item.subtotal)}`, 14, currentY)
      currentY += 8
    })
    doc.text(`Total: ${formatCurrency(quotation.total)}`, 14, currentY + 10)
    doc.save(`${quotation.quotationReference}.pdf`)
  }

  const saveQuotation = async (values: Record<string, string>) => {
    const quotationReference = createReference('AS-Q')
    const quantity = Math.max(1, Number(values.quantity) || 1)
    const unitPrice = Math.max(0, Number(values.unitPrice) || 0)
    const discount = Math.max(0, Number(values.discount) || 0)
    const subtotal = Math.max(0, quantity * unitPrice - discount)
    const quotationId = createReference('local-quotation')
    const item: QuotationItem = {
      id: createReference('local-quotation-item'),
      productService: values.productService.trim(),
      quantity,
      unitPrice,
      discount,
      subtotal,
    }

    if (isSupabaseConfigured && supabase) {
      const { data: quotation, error: quotationError } = await supabase
        .from('quotations')
        .insert({
          quotation_reference: quotationReference,
          customer_id: values.customerId,
          date_issued: new Date().toISOString().slice(0, 10),
          expiry_date: values.expiryDate || null,
          description: values.description || null,
          status: 'Draft',
          terms: values.terms || null,
          total: subtotal,
        })
        .select('id')
        .single()

      if (quotationError) throw new Error(quotationError.message)
      if (!quotation) throw new Error('Supabase did not return the saved quotation.')

      const { error: itemError } = await supabase.from('quotation_items').insert({
        quotation_id: quotation.id,
        product_service: item.productService,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        discount: item.discount,
        subtotal: item.subtotal,
      })

      if (itemError) {
        await supabase.from('quotations').delete().eq('id', quotation.id)
        throw new Error(`Quotation item could not be saved: ${itemError.message}`)
      }

      if (!await refreshData()) throw new Error('Quotation was saved, but the latest records could not be reloaded.')
      return
    }

    const customer = appState.customers.find((entry) => entry.id === values.customerId)
    const quotation: Quotation = {
      id: quotationId,
      quotationReference,
      customer: customer?.fullName ?? '',
      dateIssued: new Date().toISOString().slice(0, 10),
      expiryDate: values.expiryDate,
      description: values.description,
      status: 'Draft',
      terms: values.terms,
      items: [item],
      total: subtotal,
    }
    updateState((current) => ({ ...current, quotations: [quotation, ...current.quotations] }))
  }

  return (
    <div className="space-y-6">
      <SectionToolbar title="Quotations" buttonLabel="New quotation" onAction={() => setCreating(true)} />
      <div className="grid gap-6 lg:grid-cols-2">
        {appState.quotations.map((quotation) => (
          <Panel key={quotation.id} title={quotation.quotationReference} action={quotation.status}>
            <div className="space-y-3 text-sm text-slate-600">
              <p>Customer: {quotation.customer}</p>
              <p>Expiry: {quotation.expiryDate}</p>
              <p>Total: {formatCurrency(quotation.total)}</p>
              <div className="space-y-2">
                {quotation.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2">
                    <span>{item.productService}</span>
                    <span>{formatCurrency(item.subtotal)}</span>
                  </div>
                ))}
              </div>
              <RecordActions
                tableName="quotations"
                recordId={quotation.id}
                title="quotation"
                fields={quotationEditFields}
                initialValues={{
                  customer_id: quotation.customer,
                  date_issued: quotation.dateIssued,
                  expiry_date: quotation.expiryDate,
                  description: quotation.description,
                  status: quotation.status,
                  terms: quotation.terms,
                  total: String(quotation.total),
                }}
                onLocalSave={(values) => {
                  const customer = appState.customers.find((entry) => entry.fullName === values.customer_id)
                  updateState((current) => ({
                    ...current,
                    quotations: current.quotations.map((entry) => entry.id === quotation.id ? {
                      ...entry,
                      customer: customer?.fullName ?? values.customer_id,
                      dateIssued: values.date_issued,
                      expiryDate: values.expiry_date,
                      description: values.description,
                      status: values.status as Quotation['status'],
                      terms: values.terms,
                      total: Number(values.total),
                    } : entry),
                  }))
                }}
                onLocalDelete={() => updateState((current) => ({ ...current, quotations: current.quotations.filter((entry) => entry.id !== quotation.id) }))}
              />
              <button type="button" className="w-full rounded-xl bg-[#101B2B] px-4 py-2 text-sm font-medium text-white" onClick={() => createPdf(quotation)}>Download PDF</button>
            </div>
          </Panel>
        ))}
      </div>
      {creating && (
        <QuickCreateModal
          title="New quotation"
          onClose={() => setCreating(false)}
          onSave={saveQuotation}
          fields={[
            { name: 'customerId', label: 'Customer', type: 'select', options: customerOptions },
            { name: 'expiryDate', label: 'Expiry date', type: 'date', required: false },
            { name: 'description', label: 'Description', type: 'textarea', required: false },
            { name: 'terms', label: 'Terms', type: 'textarea', required: false },
            { name: 'productService', label: 'Product or service' },
            { name: 'quantity', label: 'Quantity', type: 'number', min: '1', step: '1' },
            { name: 'unitPrice', label: 'Unit price (ZAR)', type: 'number', min: '0', step: '0.01' },
            { name: 'discount', label: 'Discount (ZAR)', type: 'number', min: '0', step: '0.01' },
          ]}
        />
      )}
    </div>
  )
}

function MaintenancePage() {
  const { appState, refreshData, updateState } = useAppContext()
  const [creating, setCreating] = useState(false)
  const customerOptions = [{ value: '', label: 'Select customer' }, ...appState.customers.map((customer) => ({ value: customer.id, label: customer.fullName }))]

  const saveAgreement = async (values: Record<string, string>) => {
    const agreementReference = createReference('AS-MA')
    const price = Math.max(0, Number(values.maintenancePrice) || 0)
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('maintenance_agreements').insert({
        agreement_reference: agreementReference,
        customer_id: values.customerId,
        start_date: values.startDate || null,
        end_date: values.endDate || null,
        service_frequency: values.serviceFrequency.trim(),
        next_service_date: values.nextServiceDate || null,
        maintenance_price: price,
        covered_equipment: values.coveredEquipment || null,
        status: 'Active',
      })
      if (error) throw new Error(error.message)
      if (!await refreshData()) throw new Error('Agreement was saved, but the latest records could not be reloaded.')
      return
    }

    const customer = appState.customers.find((entry) => entry.id === values.customerId)
    const agreement: MaintenanceAgreement = {
      id: createReference('local-maintenance'),
      agreementReference,
      customer: customer?.fullName ?? '',
      startDate: values.startDate,
      endDate: values.endDate,
      serviceFrequency: values.serviceFrequency,
      nextServiceDate: values.nextServiceDate,
      maintenancePrice: price,
      coveredEquipment: values.coveredEquipment,
      status: 'Active',
    }
    updateState((current) => ({ ...current, maintenance: [agreement, ...current.maintenance] }))
  }

  return (
    <div className="space-y-6">
      <SectionToolbar title="Maintenance" buttonLabel="Add agreement" onAction={() => setCreating(true)} />
      <Panel title="Maintenance schedule" action={`${appState.maintenance.length} agreements`}>
        <div className="space-y-3">
          {appState.maintenance.map((agreement) => (
            <div key={agreement.id} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium text-slate-900">{agreement.agreementReference}</p>
                <p className="text-sm text-slate-600">{agreement.customer} · {agreement.serviceFrequency}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={getStatusClass(agreement.status)}>{agreement.status}</span>
                <span className="text-sm text-slate-500">Next: {agreement.nextServiceDate}</span>
                <RecordActions
                  tableName="maintenance_agreements"
                  recordId={agreement.id}
                  title="maintenance agreement"
                  fields={maintenanceEditFields}
                  initialValues={{
                    customer_id: agreement.customer,
                    start_date: agreement.startDate,
                    end_date: agreement.endDate,
                    service_frequency: agreement.serviceFrequency,
                    next_service_date: agreement.nextServiceDate,
                    maintenance_price: String(agreement.maintenancePrice),
                    covered_equipment: agreement.coveredEquipment,
                    status: agreement.status,
                  }}
                  onLocalSave={(values) => {
                    const customer = appState.customers.find((entry) => entry.fullName === values.customer_id)
                    updateState((current) => ({
                      ...current,
                      maintenance: current.maintenance.map((entry) => entry.id === agreement.id ? {
                        ...entry,
                        customer: customer?.fullName ?? values.customer_id,
                        startDate: values.start_date,
                        endDate: values.end_date,
                        serviceFrequency: values.service_frequency,
                        nextServiceDate: values.next_service_date,
                        maintenancePrice: Number(values.maintenance_price),
                        coveredEquipment: values.covered_equipment,
                        status: values.status as MaintenanceAgreement['status'],
                      } : entry),
                    }))
                  }}
                  onLocalDelete={() => updateState((current) => ({ ...current, maintenance: current.maintenance.filter((entry) => entry.id !== agreement.id) }))}
                />
              </div>
            </div>
          ))}
        </div>
      </Panel>
      {creating && (
        <QuickCreateModal
          title="Add maintenance agreement"
          onClose={() => setCreating(false)}
          onSave={saveAgreement}
          fields={[
            { name: 'customerId', label: 'Customer', type: 'select', options: customerOptions },
            { name: 'startDate', label: 'Start date', type: 'date', required: false },
            { name: 'endDate', label: 'End date', type: 'date', required: false },
            { name: 'serviceFrequency', label: 'Service frequency' },
            { name: 'nextServiceDate', label: 'Next service date', type: 'date', required: false },
            { name: 'maintenancePrice', label: 'Price (ZAR)', type: 'number', min: '0', step: '0.01' },
            { name: 'coveredEquipment', label: 'Covered equipment', type: 'textarea', required: false },
          ]}
        />
      )}
    </div>
  )
}

function InvoicesPage() {
  const { appState, refreshData, updateState } = useAppContext()
  const [creating, setCreating] = useState(false)
  const [recordingPayment, setRecordingPayment] = useState(false)
  const customerOptions = [{ value: '', label: 'Select customer' }, ...appState.customers.map((customer) => ({ value: customer.id, label: customer.fullName }))]
  const jobOptions = [{ value: '', label: 'No related job' }, ...appState.jobs.map((job) => ({ value: job.id, label: job.jobReference }))]
  const quotationOptions = [{ value: '', label: 'No related quotation' }, ...appState.quotations.map((quotation) => ({ value: quotation.id, label: quotation.quotationReference }))]
  const paymentInvoiceOptions = [
    { value: '', label: 'Select invoice' },
    ...appState.invoices.filter((invoice) => invoice.outstandingBalance > 0).map((invoice) => ({ value: invoice.id, label: `${invoice.invoiceReference} — ${formatCurrency(invoice.outstandingBalance)} due` })),
  ]

  const saveInvoice = async (values: Record<string, string>) => {
    const invoiceReference = createReference('AS-INV')
    const subtotal = Math.max(0, Number(values.subtotal) || 0)
    const vat = Math.max(0, Number(values.vat) || 0)
    const total = subtotal + vat
    const invoiceDate = new Date().toISOString().slice(0, 10)
    const amountPaid = 0

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('invoices').insert({
        invoice_reference: invoiceReference,
        customer_id: values.customerId,
        job_id: values.jobId || null,
        quotation_id: values.quotationId || null,
        invoice_date: invoiceDate,
        due_date: values.dueDate || null,
        subtotal,
        vat,
        total,
        amount_paid: amountPaid,
        outstanding_balance: total - amountPaid,
        payment_status: 'Draft',
      })
      if (error) throw new Error(error.message)
      if (!await refreshData()) throw new Error('Invoice was saved, but the latest records could not be reloaded.')
      return
    }

    const customer = appState.customers.find((entry) => entry.id === values.customerId)
    const job = appState.jobs.find((entry) => entry.id === values.jobId)
    const quotation = appState.quotations.find((entry) => entry.id === values.quotationId)
    const invoice: Invoice = {
      id: createReference('local-invoice'),
      invoiceReference,
      customer: customer?.fullName ?? '',
      jobReference: job?.jobReference ?? '',
      relatedQuotation: quotation?.quotationReference ?? '',
      invoiceDate,
      dueDate: values.dueDate,
      subtotal,
      vat,
      total,
      amountPaid,
      outstandingBalance: total,
      status: 'Draft',
    }
    updateState((current) => ({ ...current, invoices: [invoice, ...current.invoices] }))
  }

  const savePayment = async (values: Record<string, string>) => {
    const invoice = appState.invoices.find((item) => item.id === values.invoiceId)
    const amount = Number(values.amount)
    if (!invoice) throw new Error('Choose an invoice with an outstanding balance.')
    if (!Number.isFinite(amount) || amount <= 0 || amount > invoice.outstandingBalance) {
      throw new Error(`Enter an amount greater than zero and no more than ${formatCurrency(invoice.outstandingBalance)}.`)
    }

    const amountPaid = invoice.amountPaid + amount
    const outstandingBalance = Math.max(0, invoice.total - amountPaid)
    const status: Invoice['status'] = outstandingBalance === 0 ? 'Paid' : 'Partially paid'

    if (isSupabaseConfigured && supabase) {
      const { data: payment, error: paymentError } = await supabase.from('payments').insert({
        invoice_id: invoice.id,
        payment_date: new Date().toISOString().slice(0, 10),
        amount,
        payment_method: values.paymentMethod,
        reference: values.reference || null,
        notes: values.notes || null,
      }).select('id').single()
      if (paymentError) throw new Error(paymentError.message)

      const { error: invoiceError } = await supabase.from('invoices').update({
        amount_paid: amountPaid,
        outstanding_balance: outstandingBalance,
        payment_status: status,
      }).eq('id', invoice.id)

      if (invoiceError) {
        if (payment) await supabase.from('payments').delete().eq('id', payment.id)
        throw new Error(`Payment was recorded but invoice balance could not be updated: ${invoiceError.message}`)
      }

      if (!await refreshData()) throw new Error('Payment was recorded, but the latest records could not be reloaded.')
      return
    }

    updateState((current) => ({
      ...current,
      invoices: current.invoices.map((item) => item.id === invoice.id
        ? { ...item, amountPaid, outstandingBalance, status }
        : item),
    }))
  }

  return (
    <div className="space-y-6">
      <SectionToolbar title="Invoices & payments" buttonLabel="Create invoice" onAction={() => setCreating(true)} />
      <Panel title="Invoice ledger" action={`${appState.invoices.length} entries`}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-3 pr-4 font-medium">Reference</th>
                <th className="py-3 pr-4 font-medium">Customer</th>
                <th className="py-3 pr-4 font-medium">Total</th>
                <th className="py-3 pr-4 font-medium">Outstanding</th>
                <th className="py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {appState.invoices.map((invoice) => (
                <tr key={invoice.id} className="border-b border-slate-200 last:border-b-0">
                  <td className="py-3 pr-4 font-medium text-slate-900">{invoice.invoiceReference}</td>
                  <td className="py-3 pr-4 text-slate-600">{invoice.customer}</td>
                  <td className="py-3 pr-4 text-slate-600">{formatCurrency(invoice.total)}</td>
                  <td className="py-3 pr-4"><span className={getStatusClass(invoice.status)}>{formatCurrency(invoice.outstandingBalance)}</span></td>
                  <td className="py-3">
                    <RecordActions
                      tableName="invoices"
                      recordId={invoice.id}
                      title="invoice"
                      fields={invoiceEditFields}
                      initialValues={{
                        customer_id: invoice.customer,
                        job_id: invoice.jobReference,
                        quotation_id: invoice.relatedQuotation,
                        invoice_date: invoice.invoiceDate,
                        due_date: invoice.dueDate,
                        subtotal: String(invoice.subtotal),
                        vat: String(invoice.vat),
                        total: String(invoice.total),
                        amount_paid: String(invoice.amountPaid),
                        outstanding_balance: String(invoice.outstandingBalance),
                        payment_status: invoice.status,
                      }}
                      onLocalSave={(values) => {
                        const customer = appState.customers.find((entry) => entry.fullName === values.customer_id)
                        const job = appState.jobs.find((entry) => entry.jobReference === values.job_id)
                        const quotation = appState.quotations.find((entry) => entry.quotationReference === values.quotation_id)
                        updateState((current) => ({
                          ...current,
                          invoices: current.invoices.map((entry) => entry.id === invoice.id ? {
                            ...entry,
                            customer: customer?.fullName ?? values.customer_id,
                            jobReference: job?.jobReference ?? values.job_id,
                            relatedQuotation: quotation?.quotationReference ?? values.quotation_id,
                            invoiceDate: values.invoice_date,
                            dueDate: values.due_date,
                            subtotal: Number(values.subtotal),
                            vat: Number(values.vat),
                            total: Number(values.total),
                            amountPaid: Number(values.amount_paid),
                            outstandingBalance: Number(values.outstanding_balance),
                            status: values.payment_status as Invoice['status'],
                          } : entry),
                        }))
                      }}
                      onLocalDelete={() => updateState((current) => ({ ...current, invoices: current.invoices.filter((entry) => entry.id !== invoice.id) }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          disabled={!appState.invoices.some((invoice) => invoice.outstandingBalance > 0)}
          onClick={() => setRecordingPayment(true)}
          className="mt-4 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Record payment
        </button>
      </Panel>
      {creating && (
        <QuickCreateModal
          title="Create invoice"
          onClose={() => setCreating(false)}
          onSave={saveInvoice}
          fields={[
            { name: 'customerId', label: 'Customer', type: 'select', options: customerOptions },
            { name: 'jobId', label: 'Related job', type: 'select', required: false, options: jobOptions },
            { name: 'quotationId', label: 'Related quotation', type: 'select', required: false, options: quotationOptions },
            { name: 'dueDate', label: 'Due date', type: 'date', required: false },
            { name: 'subtotal', label: 'Subtotal (ZAR)', type: 'number', min: '0', step: '0.01' },
            { name: 'vat', label: 'VAT (ZAR)', type: 'number', min: '0', step: '0.01' },
          ]}
        />
      )}
      {recordingPayment && (
        <QuickCreateModal
          title="Record invoice payment"
          onClose={() => setRecordingPayment(false)}
          onSave={savePayment}
          fields={[
            { name: 'invoiceId', label: 'Invoice', type: 'select', options: paymentInvoiceOptions },
            { name: 'amount', label: 'Payment amount (ZAR)', type: 'number', min: '0.01', step: '0.01' },
            { name: 'paymentMethod', label: 'Payment method', type: 'select', options: ['EFT', 'Cash', 'Card', 'Other'].map((value) => ({ value, label: value })) },
            { name: 'reference', label: 'Reference', required: false },
            { name: 'notes', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}
    </div>
  )
}

function StaffPage() {
  const { appState, refreshData, updateState } = useAppContext()
  const [creating, setCreating] = useState(false)

  const saveStaffMember = async (values: Record<string, string>) => {
    const staffId = values.staffId.trim() || createReference('AS-ST')
    const role = normalizeRole(values.role)
    const dateJoined = values.dateJoined || new Date().toISOString().slice(0, 10)

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('staff').insert({
        staff_id: staffId,
        full_name: values.fullName.trim(),
        phone: values.phone || null,
        email: values.email.trim().toLowerCase(),
        role,
        employment_status: values.employmentStatus || 'Active',
        date_joined: dateJoined,
        skills: values.skills || null,
        notes: values.notes || null,
      })
      if (error) throw new Error(error.message)
      if (!await refreshData()) throw new Error('Staff record was saved, but the latest records could not be reloaded.')
      return
    }

    const member: StaffMember = {
      id: createReference('local-staff'),
      staffId,
      fullName: values.fullName.trim(),
      phone: values.phone,
      email: values.email.trim().toLowerCase(),
      role,
      employmentStatus: (values.employmentStatus || 'Active') as StaffMember['employmentStatus'],
      dateJoined,
      skills: values.skills,
      notes: values.notes,
    }
    updateState((current) => ({ ...current, staff: [member, ...current.staff] }))
  }

  return (
    <div className="space-y-6">
      <SectionToolbar title="Staff management" buttonLabel="Add staff" onAction={() => setCreating(true)} />
      <Panel title="Team" action={`${appState.staff.length} members`}>
        <div className="grid gap-4 md:grid-cols-2">
          {appState.staff.map((member) => (
            <div key={member.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-slate-900">{member.fullName}</p>
                  <p className="text-sm text-slate-600">{member.email}</p>
                </div>
                <span className={getStatusClass(member.employmentStatus)}>{member.employmentStatus}</span>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                <p>Role: {member.role}</p>
                <p>Skills: {member.skills}</p>
              </div>
              <div className="mt-4 border-t border-slate-200 pt-3">
                <RecordActions
                  tableName="staff"
                  recordId={member.id}
                  title="staff record"
                  fields={staffEditFields}
                  initialValues={{
                    staff_id: member.staffId,
                    full_name: member.fullName,
                    phone: member.phone,
                    email: member.email,
                    role: member.role,
                    employment_status: member.employmentStatus,
                    date_joined: member.dateJoined,
                    skills: member.skills,
                    notes: member.notes,
                  }}
                  onLocalSave={(values) => updateState((current) => ({
                    ...current,
                    staff: current.staff.map((entry) => entry.id === member.id ? {
                      ...entry,
                      staffId: values.staff_id,
                      fullName: values.full_name,
                      phone: values.phone,
                      email: values.email,
                      role: normalizeRole(values.role),
                      employmentStatus: values.employment_status as StaffMember['employmentStatus'],
                      dateJoined: values.date_joined,
                      skills: values.skills,
                      notes: values.notes,
                    } : entry),
                  }))}
                  onLocalDelete={() => updateState((current) => ({ ...current, staff: current.staff.filter((entry) => entry.id !== member.id) }))}
                />
              </div>
            </div>
          ))}
        </div>
      </Panel>
      {creating && (
        <QuickCreateModal
          title="Add staff directory record"
          onClose={() => setCreating(false)}
          onSave={saveStaffMember}
          fields={[
            { name: 'staffId', label: 'Staff ID (optional)', required: false },
            { name: 'fullName', label: 'Full name' },
            { name: 'email', label: 'Email', type: 'email' },
            { name: 'phone', label: 'Phone', required: false },
            { name: 'role', label: 'Role', type: 'select', options: roles.map((role) => ({ value: role, label: role })) },
            { name: 'employmentStatus', label: 'Employment status', type: 'select', options: ['Active', 'On leave', 'Terminated'].map((status) => ({ value: status, label: status })) },
            { name: 'dateJoined', label: 'Date joined', type: 'date', required: false },
            { name: 'skills', label: 'Skills', type: 'textarea', required: false },
            { name: 'notes', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}
    </div>
  )
}

function ReportsPage() {
  const { appState } = useAppContext()
  const outstanding = appState.invoices.reduce((sum, invoice) => sum + invoice.outstandingBalance, 0)
  const approvedQuotes = appState.quotations.filter((item) => item.status === 'Approved').length
  const completedJobs = appState.jobs.filter((job) => job.status === 'Completed').length

  const exportCsv = () => {
    const escapeCell = (value: string | number) => {
      const text = String(value)
      const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text
      return `"${safeText.replace(/"/g, '""')}"`
    }
    const rows: (string | number)[][] = [
      ['Record type', 'Reference', 'Customer', 'Status', 'Amount ZAR'],
      ...appState.jobs.map((job) => ['Job', job.jobReference, job.customer, job.status, '']),
      ...appState.quotations.map((quotation) => ['Quotation', quotation.quotationReference, quotation.customer, quotation.status, quotation.total]),
      ...appState.invoices.map((invoice) => ['Invoice', invoice.invoiceReference, invoice.customer, invoice.status, invoice.total]),
    ]
    const csv = rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `access-surveillance-report-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <SectionToolbar title="Reports & analytics" buttonLabel="Export CSV" onAction={exportCsv} />
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon={CheckCircle2} title="Completed jobs" value={String(completedJobs)} subtitle="Across all teams" color="green" />
        <StatCard icon={FileText} title="Approved quotations" value={String(approvedQuotes)} subtitle="Converted from proposals" color="blue" />
        <StatCard icon={CreditCard} title="Outstanding invoices" value={formatCurrency(outstanding)} subtitle="Includes overdue balances" color="red" />
      </div>
      <Panel title="Performance overview" action="Custom date range">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-500">Jobs by technician</p>
            <p className="mt-3 text-2xl font-semibold text-slate-900">{appState.jobs.length}</p>
            <p className="text-xs text-slate-500">Current active site workload</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-500">Quotation conversion rate</p>
            <p className="mt-3 text-2xl font-semibold text-slate-900">{Math.round((approvedQuotes / Math.max(appState.quotations.length, 1)) * 100)}%</p>
            <p className="text-xs text-slate-500">From all quotations issued</p>
          </div>
        </div>
      </Panel>
    </div>
  )
}

function SettingsPage() {
  const { appState, refreshSettings } = useAppContext()
  const [overrides, setOverrides] = useState<Partial<CompanySettings>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)
  const values = { ...appState.companySettings, ...overrides }

  const updateValue = <Key extends keyof CompanySettings,>(key: Key, value: CompanySettings[Key]) => {
    setOverrides((current) => ({ ...current, [key]: value }))
  }

  const save = async () => {
    setIsSaving(true)
    setSaveError('')
    setSaveSuccess(false)

    try {
      if (isSupabaseConfigured && supabase) {
        const client = supabase
        const payload = {
          company_name: values.companyName,
          company_logo_url: values.companyLogo || null,
          business_address: values.businessAddress || null,
          phone: values.phone || null,
          email: values.email || null,
          website: values.website || null,
          company_registration: values.companyRegistration || null,
          vat_registration_status: values.vatRegistrationStatus,
          vat_registration_number: values.vatRegistrationNumber || null,
          quotation_terms: values.quotationTerms || null,
          invoice_terms: values.invoiceTerms || null,
          default_quotation_expiry_days: values.defaultQuotationExpiry,
          default_payment_terms: values.defaultPaymentTerms || null,
          document_numbering: values.documentNumbering || null,
        }
        const { data: existing, error: lookupError } = await client
          .from('company_settings')
          .select('id')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (lookupError) {
          throw new Error(lookupError.message)
        }

        const result = existing
          ? await client.from('company_settings').update(payload).eq('id', existing.id)
          : await client.from('company_settings').insert(payload)

        if (result.error) {
          throw new Error(result.error.message)
        }
      }

      refreshSettings(values)
      setOverrides({})
      setSaveSuccess(true)
    } catch (error) {
      setSaveError(`Could not save company settings: ${error instanceof Error ? error.message : 'Unexpected error.'}`)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <SectionToolbar title="Company settings" buttonLabel={isSaving ? 'Saving...' : 'Save changes'} onAction={isSaving ? undefined : save} />
      {saveError && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">{saveError}</div>}
      {saveSuccess && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">Company settings saved.</div>}
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel title="Business profile" action="General">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Company name"><input value={values.companyName} onChange={(event) => updateValue('companyName', event.target.value)} className="input" /></Field>
            <Field label="Email"><input value={values.email} onChange={(event) => updateValue('email', event.target.value)} className="input" /></Field>
            <Field label="Phone"><input value={values.phone} onChange={(event) => updateValue('phone', event.target.value)} className="input" /></Field>
            <Field label="Website"><input value={values.website} onChange={(event) => updateValue('website', event.target.value)} className="input" /></Field>
            <Field label="Address" className="md:col-span-2"><input value={values.businessAddress} onChange={(event) => updateValue('businessAddress', event.target.value)} className="input" /></Field>
            <Field label="VAT registration status"><select value={String(values.vatRegistrationStatus)} onChange={(event) => updateValue('vatRegistrationStatus', event.target.value === 'true')} className="input"><option value="true">Enabled</option><option value="false">Disabled</option></select></Field>
            <Field label="VAT number"><input value={values.vatRegistrationNumber} onChange={(event) => updateValue('vatRegistrationNumber', event.target.value)} className="input" /></Field>
            <Field label="Default payment terms"><input value={values.defaultPaymentTerms} onChange={(event) => updateValue('defaultPaymentTerms', event.target.value)} className="input" /></Field>
            <Field label="Default quotation expiry days"><input type="number" value={values.defaultQuotationExpiry} onChange={(event) => updateValue('defaultQuotationExpiry', Number(event.target.value))} className="input" /></Field>
          </div>
        </Panel>

        <Panel title="Document settings" action="Storage">
          <div className="space-y-3 text-sm text-slate-600">
            <p>Document numbering prefix: {values.documentNumbering}</p>
            <p>VAT registration: {values.vatRegistrationStatus ? 'Enabled' : 'Disabled'}</p>
            <p>Company registration: {values.companyRegistration}</p>
            <p>Quotation terms: {values.quotationTerms}</p>
            <p>Invoice terms: {values.invoiceTerms}</p>
          </div>
        </Panel>
      </div>
    </div>
  )
}

function SectionToolbar({ title, buttonLabel, onAction }: { title: string; buttonLabel?: string; onAction?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Operations</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-900">{title}</h2>
      </div>
      {buttonLabel && (
        <button type="button" onClick={onAction} className="inline-flex items-center gap-2 rounded-xl bg-[#101B2B] px-4 py-2 text-sm font-medium text-white">
          <Plus size={16} />
          {buttonLabel}
        </button>
      )}
    </div>
  )
}

function RecordActions({
  tableName,
  recordId,
  title,
  fields,
  initialValues,
  toPayload,
  onLocalSave,
  onLocalDelete,
}: {
  tableName: string
  recordId: string
  title: string
  fields: QuickFormField[]
  initialValues: Record<string, string>
  toPayload?: (values: Record<string, string>) => Record<string, unknown>
  onLocalSave: (values: Record<string, string>) => void
  onLocalDelete: () => void
}) {
  const { refreshData } = useAppContext()
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState(false)
  const [isOpening, setIsOpening] = useState(false)
  const [error, setError] = useState('')

  const openEditor = async () => {
    setError('')
    if (isSupabaseConfigured && supabase) {
      setIsOpening(true)
      try {
        const { data, error: loadError } = await supabase.from(tableName).select('*').eq('id', recordId).single()
        if (loadError) {
          setError(`Could not load record: ${loadError.message}`)
          return
        }
        const record = data as SupabaseRow
        setFormValues(Object.fromEntries(fields.map((field) => {
          const value = record[field.name]
          return [field.name, value === null || value === undefined ? '' : Array.isArray(value) ? value.join(', ') : String(value)]
        })))
      } catch (loadError) {
        setError(`Could not load record: ${loadError instanceof Error ? loadError.message : 'Unexpected error.'}`)
        return
      } finally {
        setIsOpening(false)
      }
    } else {
      setFormValues(initialValues)
    }
    setEditing(true)
  }

  const save = async (values: Record<string, string>) => {
    if (isSupabaseConfigured && supabase) {
      const payload = toPayload
        ? toPayload(values)
        : Object.fromEntries(fields.map((field) => {
          const value = values[field.name]?.trim() ?? ''
          if (!value) return [field.name, null]
          return [field.name, field.type === 'number' ? Number(value) : value]
        }))
      const { data: savedRecord, error: saveError } = await supabase.from(tableName).update(payload).eq('id', recordId).select('id').maybeSingle()
      if (saveError) throw new Error(saveError.message)
      if (!savedRecord) throw new Error('No record was updated. Check your access role and table policies.')
      if (!await refreshData()) throw new Error('Record was updated, but the latest Supabase data could not be reloaded.')
    } else {
      onLocalSave(values)
    }
  }

  const remove = async () => {
    if (!window.confirm(`Delete this ${title.toLowerCase()} record? This cannot be undone.`)) return
    setError('')
    try {
      if (isSupabaseConfigured && supabase) {
        const { data: deletedRecord, error: deleteError } = await supabase.from(tableName).delete().eq('id', recordId).select('id').maybeSingle()
        if (deleteError) {
          setError(`Could not delete record: ${deleteError.message}`)
          return
        }
        if (!deletedRecord) {
          setError('No record was deleted. Check your access role and table policies.')
          return
        }
        if (!await refreshData()) setError('Record was deleted, but the latest Supabase data could not be reloaded.')
      } else {
        onLocalDelete()
      }
    } catch (deleteError) {
      setError(`Could not delete record: ${deleteError instanceof Error ? deleteError.message : 'Unexpected error.'}`)
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span role="alert" className="max-w-56 text-left text-xs text-red-700">{error}</span>}
      <button type="button" disabled={isOpening} onClick={() => void openEditor()} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50">{isOpening ? 'Loading...' : 'Edit'}</button>
      <button type="button" onClick={() => void remove()} className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700">Delete</button>
      {editing && (
        <QuickCreateModal
          title={`Edit ${title}`}
          fields={fields}
          initialValues={formValues}
          saveLabel="Save changes"
          onClose={() => setEditing(false)}
          onSave={save}
        />
      )}
    </div>
  )
}

function QuickCreateModal({
  title,
  fields,
  onClose,
  onSave,
  initialValues,
  saveLabel = 'Save',
}: {
  title: string
  fields: QuickFormField[]
  onClose: () => void
  onSave: (values: Record<string, string>) => Promise<void>
  initialValues?: Record<string, string>
  saveLabel?: string
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.name, initialValues?.[field.name] ?? (field.type === 'select' ? field.options?.[0]?.value ?? '' : '')])),
  )
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    try {
      await onSave(values)
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save this record.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="quick-create-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 id="quick-create-title" className="text-xl font-semibold text-slate-900">{title}</h2>
          <button type="button" aria-label="Close form" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={onClose}><X size={18} /></button>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((field) => (
              <label key={field.name} className={field.type === 'textarea' ? 'block sm:col-span-2' : 'block'}>
                <span className="mb-2 block text-sm font-medium text-slate-600">{field.label}</span>
                {field.type === 'select' ? (
                  <select
                    required={field.required !== false}
                    value={values[field.name] ?? ''}
                    onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                    className="input w-full"
                  >
                    {values[field.name] && !field.options?.some((option) => option.value === values[field.name]) && <option value={values[field.name]}>{values[field.name]}</option>}
                    {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                ) : field.type === 'textarea' ? (
                  <textarea
                    required={field.required !== false}
                    value={values[field.name] ?? ''}
                    onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                    className="input min-h-24 w-full"
                  />
                ) : (
                  <input
                    type={field.type ?? 'text'}
                    required={field.required !== false}
                    min={field.min}
                    step={field.step}
                    value={values[field.name] ?? ''}
                    onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                    className="input w-full"
                  />
                )}
              </label>
            ))}
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button type="button" disabled={isSaving} onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">Cancel</button>
            <button type="submit" disabled={isSaving} className="rounded-xl bg-[#101B2B] px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{isSaving ? 'Saving...' : saveLabel}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Panel({ title, action, children }: { title: string; action?: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        {action && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{action}</span>}
      </div>
      {children}
    </div>
  )
}

function StatCard({ icon: Icon, title, value, subtitle, color }: { icon: any; title: string; value: string; subtitle: string; color: string }) {
  const paletteMap: Record<string, string> = {
    blue: 'bg-[#2675D8]/10 text-[#2675D8]',
    amber: 'bg-[#E89A35]/10 text-[#E89A35]',
    green: 'bg-[#16A36A]/10 text-[#16A36A]',
    red: 'bg-[#D94A4A]/10 text-[#D94A4A]',
    gold: 'bg-[#C6A15B]/10 text-[#C6A15B]',
    navy: 'bg-[#101B2B]/10 text-[#101B2B]',
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${paletteMap[color]}`}>
          <Icon size={22} />
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">{subtitle}</p>
    </div>
  )
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-sm font-medium text-slate-600">{label}</span>
      {children}
    </label>
  )
}

export default App
