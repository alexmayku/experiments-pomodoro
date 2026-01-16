class CreatePomodoros < ActiveRecord::Migration[8.0]
  def change
    create_table :pomodoros do |t|
      t.datetime :started_at
      t.datetime :completed_at
      t.string :description
      t.string :tags
      t.integer :duration_minutes, default: 25

      t.timestamps
    end

    add_index :pomodoros, :completed_at
  end
end

