import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  ChevronUp, 
  ChevronDown, 
  ChevronLeft, 
  ChevronRight,
  MoreVertical,
  Download
} from 'lucide-react';
import { LoadingTable } from './LoadingTable';
import EmptyState, { SearchEmptyState } from './EmptyState';

interface DataTableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  filterable?: boolean;
  width?: string;
  render?: (value: any, row: any) => React.ReactNode;
  type?: 'text' | 'number' | 'date' | 'boolean' | 'custom';
  format?: (value: any) => string;
}

interface DataTableAction {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onClick: (row: any) => void;
  disabled?: (row: any) => boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}

interface DataTableProps {
  data: any[];
  columns: DataTableColumn[];
  actions?: DataTableAction[];
  loading?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  pagination?: boolean;
  pageSize?: number;
  className?: string;
  emptyMessage?: string;
  onRowClick?: (row: any) => void;
  exportable?: boolean;
  onExport?: (format: 'csv' | 'json') => void;
}

interface SortState {
  field: string;
  direction: 'asc' | 'desc';
}

interface FilterState {
  [key: string]: string;
}

export const DataTable: React.FC<DataTableProps> = ({
  data,
  columns,
  actions = [],
  loading = false,
  searchable = true,
  searchPlaceholder = 'Search...',
  pagination = true,
  pageSize = 10,
  className = '',
  emptyMessage = 'No data available',
  onRowClick,
  exportable = true,
  onExport
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortState, setSortState] = useState<SortState>({ field: '', direction: 'asc' });
  const [filters, setFilters] = useState<FilterState>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState<string | null>(null);

  // Filter and sort data
  const processedData = useMemo(() => {
    let filtered = [...data];

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(row =>
        columns.some(column => {
          const value = row[column.key];
          if (value === null || value === undefined) return false;
          return value.toString().toLowerCase().includes(searchTerm.toLowerCase());
        })
      );
    }

    // Apply column filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        filtered = filtered.filter(row =>
          row[key]?.toString().toLowerCase().includes(value.toLowerCase())
        );
      }
    });

    // Apply sorting
    if (sortState.field) {
      filtered.sort((a, b) => {
        const aValue = a[sortState.field];
        const bValue = b[sortState.field];
        
        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;
        
        let comparison = 0;
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          comparison = aValue - bValue;
        } else {
          comparison = aValue.toString().localeCompare(bValue.toString());
        }
        
        return sortState.direction === 'desc' ? -comparison : comparison;
      });
    }

    return filtered;
  }, [data, searchTerm, filters, sortState, columns]);

  // Pagination
  const paginatedData = useMemo(() => {
    if (!pagination) return processedData;
    
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return processedData.slice(startIndex, endIndex);
  }, [processedData, currentPage, pageSize, pagination]);

  const totalPages = Math.ceil(processedData.length / pageSize);

  const handleSort = (field: string) => {
    setSortState(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleFilter = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const handleExport = (format: 'csv' | 'json') => {
    if (onExport) {
      onExport(format);
    } else {
      // Default export implementation
      const dataToExport = processedData;
      
      if (format === 'csv') {
        const headers = columns.map(col => col.label).join(',');
        const rows = dataToExport.map(row =>
          columns.map(col => {
            const value = row[col.key];
            return typeof value === 'string' && value.includes(',') 
              ? `"${value}"` 
              : value;
          }).join(',')
        );
        const csv = [headers, ...rows].join('\n');
        downloadFile(csv, 'data.csv', 'text/csv');
      } else {
        const json = JSON.stringify(dataToExport, null, 2);
        downloadFile(json, 'data.json', 'application/json');
      }
    }
  };

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderCell = (row: any, column: DataTableColumn) => {
    const value = row[column.key];
    
    if (column.render) {
      return column.render(value, row);
    }
    
    if (column.format) {
      return column.format(value);
    }
    
    if (column.type === 'boolean') {
      return (
        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
          value ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
        }`}>
          {value ? 'Yes' : 'No'}
        </span>
      );
    }
    
    if (column.type === 'date' && value) {
      return new Date(value).toLocaleDateString();
    }
    
    if (value === null || value === undefined) {
      return <span className="text-gray-400">-</span>;
    }
    
    return value.toString();
  };

  // Show loading table when loading
  if (loading) {
    return (
      <LoadingTable 
        rows={pageSize || 5} 
        columns={columns.length} 
        showHeader={true}
        columnWidths={columns.map(col => col.width)}
        className={className}
      />
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="p-3 lg:p-4 border-b border-gray-200">
        <div className="flex flex-col space-y-3 lg:space-y-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <h3 className="mobile-heading-3 text-lg font-medium text-gray-900">
                {data.length} {data.length === 1 ? 'item' : 'items'}
              </h3>
              {loading && (
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              )}
            </div>
          </div>
          
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-3 lg:space-y-0 lg:space-x-2">
            {searchable && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={searchPlaceholder}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="mobile-input pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full lg:w-auto"
                />
              </div>
            )}
            
            <div className="flex items-center space-x-2">
              {columns.some(col => col.filterable) && (
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`mobile-touch-target p-2 rounded-lg border transition-colors ${
                    showFilters 
                      ? 'bg-blue-50 border-blue-300 text-blue-600' 
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Filter size={16} />
                </button>
              )}
              
              {exportable && (
                <button
                  onClick={() => handleExport('csv')}
                  className="mobile-touch-target p-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
                  title="Export CSV"
                >
                  <Download size={16} />
                </button>
              )}
            </div>
          </div>
        
        {/* Filters */}
        {showFilters && (
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {columns.filter(col => col.filterable).map(column => (
              <div key={column.key} className="relative">
                <input
                  type="text"
                  placeholder={`Filter by ${column.label}`}
                  value={filters[column.key] || ''}
                  onChange={(e) => handleFilter(column.key, e.target.value)}
                  className="mobile-input w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            ))}
          </div>
        )}
        </div>
      </div>

      {/* Table - Desktop */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {columns.map(column => (
                <th
                  key={column.key}
                  className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                    column.sortable ? 'cursor-pointer hover:bg-gray-100' : ''
                  }`}
                  style={{ width: column.width }}
                  onClick={() => column.sortable && handleSort(column.key)}
                >
                  <div className="flex items-center space-x-1">
                    <span>{column.label}</span>
                    {column.sortable && sortState.field === column.key && (
                      <span className="text-blue-600">
                        {sortState.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </span>
                    )}
                  </div>
                </th>
              ))}
              {actions.length > 0 && (
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedData.map((row, index) => (
              <tr
                key={index}
                className={`hover:bg-gray-50 ${onRowClick ? 'cursor-pointer' : ''}`}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map(column => (
                  <td key={column.key} className="px-4 py-3 text-sm text-gray-900">
                    {renderCell(row, column)}
                  </td>
                ))}
                {actions.length > 0 && (
                  <td className="px-4 py-3 text-right text-sm">
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowActionsMenu(showActionsMenu === `${index}` ? null : `${index}`);
                        }}
                        className="p-1 text-gray-400 hover:text-gray-600 rounded"
                      >
                        <MoreVertical size={16} />
                      </button>
                      
                      {showActionsMenu === `${index}` && (
                        <div className="absolute right-0 z-10 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200">
                          <div className="py-1">
                            {actions.map(action => {
                              const isDisabled = action.disabled?.(row);
                              return (
                                <button
                                  key={action.key}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isDisabled) {
                                      action.onClick(row);
                                      setShowActionsMenu(null);
                                    }
                                  }}
                                  disabled={isDisabled}
                                  className={`w-full text-left px-4 py-2 text-sm flex items-center space-x-2 ${
                                    isDisabled 
                                      ? 'text-gray-400 cursor-not-allowed' 
                                      : action.variant === 'danger'
                                        ? 'text-red-600 hover:bg-red-50'
                                        : action.variant === 'primary'
                                          ? 'text-blue-600 hover:bg-blue-50'
                                          : 'text-gray-700 hover:bg-gray-50'
                                  }`}
                                >
                                  {action.icon && <span>{action.icon}</span>}
                                  <span>{action.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        
        {/* Empty state */}
        {!loading && paginatedData.length === 0 && (
          <div className="min-h-[200px]">
            {searchTerm || Object.values(filters).some(value => value) ? (
              <SearchEmptyState
                searchTerm={searchTerm}
                onClearSearch={() => {
                  setSearchTerm('');
                  setFilters({});
                }}
                onRefineSearch={() => setShowFilters(!showFilters)}
              />
            ) : (
              <EmptyState
                type="no-data"
                title={emptyMessage}
                description="There are no items to display at this time"
                actions={[
                  ...(onExport ? [{
                    label: 'Export Data',
                    onClick: () => handleExport('csv'),
                    variant: 'secondary' as const,
                    icon: <Download size={16} />
                  }] : [])
                ]}
                size="medium"
              />
            )}
          </div>
        )}
      </div>

      {/* Mobile Card View */}
      <div className="lg:hidden">
        {paginatedData.length === 0 && !loading ? (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-2">
              <Search size={48} className="mx-auto" />
            </div>
            <p className="text-gray-500">{emptyMessage}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {paginatedData.map((row, index) => (
              <div
                key={index}
                className="mobile-transaction-item bg-white border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
                onClick={() => onRowClick?.(row)}
              >
                <div className="space-y-3">
                  {columns.map(column => (
                    <div key={column.key} className="flex justify-between items-start">
                      <span className="mobile-caption text-sm font-medium text-gray-500">
                        {column.label}:
                      </span>
                      <div className="mobile-body text-sm text-gray-900 text-right">
                        {renderCell(row, column)}
                      </div>
                    </div>
                  ))}
                  
                  {actions.length > 0 && (
                    <div className="pt-3 border-t border-gray-100">
                      <div className="mobile-button-group">
                        {actions.map(action => {
                          const isDisabled = action.disabled?.(row);
                          return (
                            <button
                              key={action.key}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isDisabled) {
                                  action.onClick(row);
                                }
                              }}
                              disabled={isDisabled}
                              className={`mobile-button w-full text-left px-4 py-2 text-sm flex items-center justify-center space-x-2 rounded-lg ${
                                isDisabled 
                                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                                  : action.variant === 'danger'
                                    ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                    : action.variant === 'primary'
                                      ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                      : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                              }`}
                            >
                              {action.icon && <span>{action.icon}</span>}
                              <span>{action.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination && totalPages > 1 && (
        <div className="px-3 lg:px-4 py-3 border-t border-gray-200">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-3 lg:space-y-0">
            <div className="mobile-caption text-sm text-gray-700 text-center lg:text-left">
              Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, processedData.length)} of {processedData.length} results
            </div>
            <div className="flex items-center justify-center lg:justify-end space-x-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="mobile-touch-target p-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                <ChevronLeft size={16} />
              </button>
              
              <div className="flex items-center space-x-1">
                {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage <= 2) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 1) {
                    pageNum = totalPages - 2 + i;
                  } else {
                    pageNum = currentPage - 1 + i;
                  }
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`mobile-touch-target px-3 py-1 rounded-lg text-sm ${
                        currentPage === pageNum
                          ? 'bg-blue-600 text-white'
                          : 'border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="mobile-touch-target p-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataTable;
