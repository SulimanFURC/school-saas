import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { catchError, finalize, of } from 'rxjs';

import { SubjectDto, SubjectService } from '../../../services/subject.service';

@Component({
  selector: 'app-subject-list',
  imports: [
    FormsModule,
    TableModule,
    ButtonModule,
    InputTextModule,
    DialogModule,
    ToastModule,
    TagModule,
    ConfirmDialogModule,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './subject-list.component.html',
  styleUrl: './subject-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubjectListComponent implements OnInit {
  private api = inject(SubjectService);
  private messages = inject(MessageService);
  private confirmation = inject(ConfirmationService);
  private destroyRef = inject(DestroyRef);

  loading = signal(true);
  rows = signal<SubjectDto[]>([]);

  dialogVisible = signal(false);
  submitting = signal(false);
  editId = signal<number | null>(null);
  nameInput = signal('');
  isActiveInput = signal(true);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api
      .list()
      .pipe(
        catchError((e: { error?: { message?: string } }) => {
          this.messages.add({
            severity: 'error',
            summary: 'Error',
            detail: e.error?.message || 'Failed to load subjects',
            life: 5000,
          });
          return of([] as SubjectDto[]);
        }),
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (rows) => {
          this.rows.set((rows || []).slice().sort((a, b) => a.name.localeCompare(b.name)));
        },
      });
  }

  openCreate(): void {
    this.editId.set(null);
    this.nameInput.set('');
    this.isActiveInput.set(true);
    this.dialogVisible.set(true);
  }

  openEdit(row: SubjectDto): void {
    this.editId.set(row.id);
    this.nameInput.set(row.name || '');
    this.isActiveInput.set(!!row.is_active);
    this.dialogVisible.set(true);
  }

  closeDialog(): void {
    this.dialogVisible.set(false);
  }

  save(): void {
    const name = this.nameInput().trim();
    if (!name) {
      this.messages.add({
        severity: 'warn',
        summary: 'Subject',
        detail: 'Subject name is required.',
        life: 4000,
      });
      return;
    }
    this.submitting.set(true);
    const id = this.editId();
    const is_active = this.isActiveInput();
    const req$ = id
      ? this.api.update(id, { name, is_active })
      : this.api.create({ name, is_active });

    req$
      .pipe(
        finalize(() => this.submitting.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.messages.add({
            severity: 'success',
            summary: 'Saved',
            detail: id ? 'Subject updated.' : 'Subject created.',
            life: 3000,
          });
          this.closeDialog();
          this.load();
        },
        error: (e: { error?: { message?: string } }) => {
          this.messages.add({
            severity: 'error',
            summary: 'Error',
            detail: e.error?.message || 'Save failed',
            life: 5000,
          });
        },
      });
  }

  remove(row: SubjectDto): void {
    this.confirmation.confirm({
      header: 'Delete subject?',
      message: `Delete “${row.name}”? This cannot be undone.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.delete(row.id).subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: 'Deleted',
              detail: 'Subject deleted.',
              life: 3000,
            });
            this.load();
          },
          error: (e: { error?: { message?: string } }) => {
            this.messages.add({
              severity: 'error',
              summary: 'Error',
              detail: e.error?.message || 'Delete failed',
              life: 5000,
            });
          },
        });
      },
    });
  }

  statusSeverity(row: SubjectDto): 'success' | 'secondary' {
    return row.is_active ? 'success' : 'secondary';
  }
}

