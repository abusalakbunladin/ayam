"""tambah kolom metode (kirim/ambil) di order"""
from alembic import op
import sqlalchemy as sa

revision = 'c3a1e5d7b9f2'
down_revision = '088f402eae9a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('metode', sa.String(length=10), server_default='kirim', nullable=False))


def downgrade() -> None:
    op.drop_column('orders', 'metode')
