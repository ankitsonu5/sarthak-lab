import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'filter',
  standalone: true
})
export class FilterPipe implements PipeTransform {
  transform(items: any[], field: string, value: any): any[] {
    if (!items || !field || value === undefined || value === null || value === '') {
      return items;
    }
    
    return items.filter(item => {
      if (item[field] === value) {
        return true;
      }
      return false;
    });
  }
}
