'use client'

import { isEmpty } from 'lodash-es'
import { Check } from 'lucide-react'
import { useMemo, useState } from 'react'
import SearchInput from '~/builder/core/components/sidepanels/panels/add-blocks/search-input'
import { removeSlugExtension } from '~/builder/pages/utils/slug-utils'
import { useChaiFeatureFlag } from '~/builder/register-apis'
import { Button } from '~/components/ui/button'
import { Command, CommandEmpty, CommandItem } from '~/components/ui/command'
import Tooltip from '~/builder/pages/utils/tooltip'
import { Label } from '~/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
  DialogHeader,
} from '~/components/ui/dialog'
import ChaiCommandList from './ui/chai-command-list'
import { useTranslation } from 'react-i18next'
import { ChevronDownIcon } from '@radix-ui/react-icons'

// Utility to conditionally join class names
const cn = (...classes: (string | undefined)[]) =>
  classes.filter(Boolean).join(' ')

export interface PageData {
  id: string
  name: string
  slug: string
  parent?: string
}

interface ParentPageSelectorProps {
  pages: PageData[] | undefined
  selectedParentId: string
  onChange: (value: string) => void
  className?: string
  id?: string
  currentPage?: Partial<any>
}

export function ParentPageSelector({
  pages,
  selectedParentId,
  onChange,
  className,
  id = 'parentPage',
}: ParentPageSelectorProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const isSearchAndSelectEnabled = useChaiFeatureFlag(
    'enable-add-page-dropdown'
  )
  if (!isSearchAndSelectEnabled) {
    className =
      'flex h-8 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-xs text-foreground shadow-sm ring-offset-surface focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground [&>span]:line-clamp-1'
  }

  const sortedPages = useMemo(() => {
    if (!pages || pages.length === 0) return []

    // Filter valid pages
    const validPages = pages
      .filter((page) => !isEmpty(page.slug))
      .filter((page) => page.slug !== '/')

    // Sort pages by slug
    return validPages.sort((a, b) => a.slug.localeCompare(b.slug))
  }, [pages])

  // Filter pages based on search query
  const filteredPages = useMemo(() => {
    if (!searchQuery.trim()) return sortedPages

    const query = searchQuery.toLowerCase()
    return sortedPages.filter(
      (page) =>
        page.name.toLowerCase().includes(query) ||
        page.slug.toLowerCase().includes(query)
    )
  }, [sortedPages, searchQuery])

  // Calculate indentation level based on slug depth
  const getIndentationLevel = (slug: string): number => {
    // Count the number of slashes (/) minus 1 for the leading slash
    return Math.max(0, (slug.match(/\//g) || []).length - 1)
  }

  // Get the relevant part of the slug (last segment) without extension
  const getDisplaySlug = (slug: string): string => {
    if (slug === '/') return '/'

    // For child pages, extract just the last part of the slug
    const segments = slug.split('/').filter(Boolean)
    if (segments.length === 0) return ''

    return removeSlugExtension(segments[segments.length - 1])
  }

  // Get display text for the selected page
  const getDisplayText = (): string => {
    if (!selectedParentId || selectedParentId === 'none') return t('None')
    const selectedPage = sortedPages.find(
      (page) => page.id === selectedParentId
    )
    return selectedPage
      ? `${selectedPage.name} (${getDisplaySlug(selectedPage.slug)})`
      : t('None')
  }

  return (
    <div className='space-y-0.5'>
      <Label htmlFor={id}>{t("Parent")}</Label>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button
            id={id}
            variant='outline'
            role='combobox'
            className={cn(
              'w-full justify-between !bg-transparent font-normal hover:bg-transparent',
              className
            )}
            data-testid='parent-page-selector'
          >
            {getDisplayText()}
            <ChevronDownIcon className='h-4 w-4 opacity-50' />
          </Button>
        </DialogTrigger>
        <DialogContent className='flex max-h-[70vh] min-h-[500px] flex-col gap-0 overflow-hidden border p-0 sm:max-w-[425px]'>
          <DialogHeader className='border-b border-border px-2 py-3.5'>
            <DialogTitle className='flex items-center gap-2 text-sm font-normal'>
              {t('Select parent page')}
            </DialogTitle>
            
          </DialogHeader>
          <Command
            shouldFilter={false}
            className='flex max-h-full w-full flex-1 flex-col'
          >
            <div className='border-b p-2'>
              <SearchInput
                value={searchQuery}
                setValue={setSearchQuery}
                placeholder={t('Search page...')}
                autoFocus
              />
            </div>
            <ChaiCommandList className='h-full flex-1 overflow-y-auto p-1'>
              <CommandEmpty className='flex min-h-[300px] items-center justify-center py-6 text-center text-xs text-muted-foreground'>
                {t("No pages found.")}
              </CommandEmpty>
              <div className='flex flex-col'>
                {/* Select None Option */}
                {selectedParentId && selectedParentId !== 'none' && (!searchQuery || 'none'.includes(searchQuery.toLowerCase())) && (
                  <CommandItem
                    value="none"
                    onSelect={() => {
                      onChange("none")
                      setIsOpen(false)
                      setSearchQuery('')
                    }}
                    style={{ paddingLeft: '12px' }}
                    className='relative flex min-h-[28px] cursor-pointer items-center justify-start overflow-hidden whitespace-nowrap rounded py-0 pr-2 border-b border-border/40 bg-muted/10 text-muted-foreground'
                  >
                    <div className='relative z-10 mr-2 flex flex-1 items-center overflow-hidden text-[10px] font-medium'>
                      {t('Select none')}
                    </div>
                    <Check
                      className={cn(
                        'ml-auto h-4 w-4 shrink-0',
                        !selectedParentId || selectedParentId === 'none'
                          ? 'opacity-100'
                          : 'opacity-0'
                      )}
                    />
                  </CommandItem>
                )}
                {filteredPages.map((page) => {
                  const level = getIndentationLevel(page.slug)
                  const displaySlug = getDisplaySlug(page.slug)

                  // Calculate left padding for the item text
                  const paddingLeft = level * 14 + 12

                  return (
                    <CommandItem
                      key={page.id}
                      value={page.id}
                      onSelect={() => {
                        onChange(page.id)
                        setIsOpen(false)
                        setSearchQuery('')
                      }}
                      style={{ paddingLeft: `${paddingLeft}px` }}
                      className='relative flex min-h-[28px] cursor-pointer items-center justify-start overflow-hidden whitespace-nowrap rounded py-0 pr-2'
                    >
                      {/* Tree structure lines */}
                      {!searchQuery && (
                        <div className='pointer-events-none absolute inset-0'>
                          {Array.from({ length: level }).map((_, i) => {
                            const isLast = i === level - 1
                            const leftPos = i * 14 + 14
                            return (
                              <div key={i}>
                                <div
                                  className={cn(
                                    'absolute border-l border-border/50',
                                    isLast ? 'top-0 h-1/2' : 'top-0 h-full'
                                  )}
                                  style={{ left: `${leftPos}px` }}
                                />
                                {isLast && (
                                  <div
                                    className='absolute top-1/2 border-t border-border/50'
                                    style={{
                                      left: `${leftPos}px`,
                                      width: '10px',
                                    }}
                                  />
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      <Tooltip
                        content={
                          <span>
                            {page.name}{' '}
                            <i className='text-gray-500'>({page.slug})</i>
                          </span>
                        }
                        side='right'
                        delayDuration={400}
                        className='max-w-[300px] break-words text-xs'
                      >
                        <div className='relative z-10 mr-2 flex flex-1 items-center overflow-hidden text-[10px]'>
                          <span className='truncate'>{page.name}</span>
                          <span className='ml-1 shrink-0 truncate font-extralight text-muted-foreground'>
                            ({displaySlug})
                          </span>
                        </div>
                      </Tooltip>

                      <Check
                        className={cn(
                          'ml-auto h-4 w-4 shrink-0',
                          selectedParentId === page.id
                            ? 'opacity-100'
                            : 'opacity-0'
                        )}
                      />
                    </CommandItem>
                  )
                })}
              </div>
            </ChaiCommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </div>
  )
}
