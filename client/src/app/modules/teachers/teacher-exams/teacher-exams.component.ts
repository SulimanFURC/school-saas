import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';

@Component({
  selector: 'app-teacher-exams',
  standalone: true,
  imports: [RouterLink, CardModule, ButtonModule],
  templateUrl: './teacher-exams.component.html',
  styleUrl: './teacher-exams.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeacherExamsComponent {}
