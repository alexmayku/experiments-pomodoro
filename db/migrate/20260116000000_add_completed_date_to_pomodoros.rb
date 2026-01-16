class AddCompletedDateToPomodoros < ActiveRecord::Migration[8.0]
  def change
    add_column :pomodoros, :completed_date, :date
    add_index :pomodoros, :completed_date
  end
end

