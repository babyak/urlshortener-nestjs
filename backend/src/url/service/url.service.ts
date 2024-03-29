import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UrlEntity } from '../models/url.entity';
import { Repository } from 'typeorm';
import { Url } from '../models/url.interface';
import { Observable, from, forkJoin } from 'rxjs';
import { getDefaultExpiryDate } from 'src/utils/date';
import { SearchUrlDTO } from '../controller/searchquery.dto';
import { CreateUrlDTO } from '../controller/create.url.dto';
import { plainToClass } from 'class-transformer';
import { normalizeUrl } from 'src/utils/normalizeUrl';

export enum SortBy {
  hits = 'hits',
  expiry = 'expiry',
  id = 'id',
  originalUrl = 'originalUrl',
  code = 'code',
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

@Injectable()
export class UrlService {
  constructor(
    @InjectRepository(UrlEntity)
    private readonly urlRepository: Repository<UrlEntity>,
  ) {}

  create(urlDto: CreateUrlDTO): Observable<Url> {
    const url = plainToClass(UrlEntity, urlDto);
    return from(this.urlRepository.save(url));
  }

  findByCode(code: string): Observable<Url> {
    return from(
      this.urlRepository.findOne({
        where: { code: code },
      }),
    );
  }

  findByUrl(url: string): Observable<Url> {
    return from(
      this.urlRepository.findOne({
        where: { originalUrl: normalizeUrl(url) },
      }),
    );
  }

  findAndCount(searchQuery: SearchUrlDTO): Observable<any> {
    const query = this.urlRepository
      .createQueryBuilder('url')
      .select([
        'url.id',
        'url.originalUrl',
        'url.code',
        'url.expiry',
        'url.hits',
      ])
      .where(
        'url.deleted = false AND url.originalUrl LIKE :keywordUrl AND url.code LIKE :keywordCode',
        {
          keywordUrl: `%${searchQuery.keywordUrl}%`,
          keywordCode: `%${searchQuery.keywordCode}%`,
        },
      )
      .orderBy({ [searchQuery._sort]: searchQuery._order })
      .skip(searchQuery._start)
      .take(searchQuery._end - searchQuery._start);

    return forkJoin({
      count: query.getCount(),
      urls: query.getMany(),
    });
  }

  addLinkHit(url: Url): void {
    this.urlRepository
      .createQueryBuilder()
      .update()
      .set({ hits: () => 'hits + 1' })
      .where('id = :id', { id: url.id })
      .execute();
  }

  delete(id: number) {
    return this.urlRepository
      .createQueryBuilder()
      .update()
      .set({ deleted: true })
      .where('id = :id', { id })
      .execute();
  }

  updateUrlExpiry(url: Url, expiryDate?: Date): Observable<Url> {
    const newExpiryDate = expiryDate ? expiryDate : getDefaultExpiryDate();
    this.urlRepository
      .createQueryBuilder()
      .update()
      .set({ expiry: newExpiryDate, deleted: false })
      .where('id = :id', { id: url.id })
      .execute();

    return from(this.urlRepository.findOne({ where: { id: url.id } }));
  }
}
