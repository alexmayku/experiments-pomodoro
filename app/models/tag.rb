# frozen_string_literal: true

class Tag < ApplicationRecord
  validates :name, presence: true, uniqueness: { case_sensitive: false }

  # Returns all tag names, sorted alphabetically
  def self.all_names
    order(:name).pluck(:name)
  end
end

