import { Contact } from '../types'

const CONTACTS_KEY = 'dr_contacts_v1'

export class ContactService {
  private static instance: ContactService
  private contacts: Contact[] = []

  private constructor() {
    this.loadContacts()
  }

  public static getInstance(): ContactService {
    if (!ContactService.instance) {
      ContactService.instance = new ContactService()
    }
    return ContactService.instance
  }

  private loadContacts(): void {
    const stored = localStorage.getItem(CONTACTS_KEY)
    if (stored) {
      try {
        this.contacts = JSON.parse(stored)
      } catch (e) {
        console.error('[ContactService] Failed to parse contacts:', e)
        this.contacts = []
      }
    }
  }

  private saveContacts(): void {
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(this.contacts))
  }

  public getContacts(): Contact[] {
    return [...this.contacts]
  }

  public getContact(ghostId: string): Contact | undefined {
    return this.contacts.find((c) => c.ghostId === ghostId)
  }

  public addContact(ghostId: string, publicKey: string, name: string): Contact {
    const existing = this.getContact(ghostId)
    if (existing) {
      return existing
    }

    const newContact: Contact = {
      ghostId,
      publicKey,
      name: name || ghostId,
      isVerified: false,
      addedAt: Date.now()
    }

    this.contacts.push(newContact)
    this.saveContacts()
    return newContact
  }

  public removeContact(ghostId: string): void {
    this.contacts = this.contacts.filter((c) => c.ghostId !== ghostId)
    this.saveContacts()
  }

  public verifyContact(ghostId: string, isVerified: boolean): void {
    this.contacts = this.contacts.map((c) => (c.ghostId === ghostId ? { ...c, isVerified } : c))
    this.saveContacts()
  }
}

export const contactService = ContactService.getInstance()
